import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { NotFoundError, ValidationError } from '../lib/errors';
import { createAuditLog } from '../lib/audit';
import { authenticateToken } from '../middleware/auth';
import { requirePermission } from '../middleware/authorize';

const router = Router();

const createSessionSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  sessionType: z.enum(['FORENOON', 'AFTERNOON'], { errorMap: () => ({ message: 'Session type must be FORENOON or AFTERNOON' }) }),
  startTime: z.string().min(1, 'Start time is required'),
  endTime: z.string().min(1, 'End time is required'),
  subject: z.string().min(1, 'Subject is required'),
  topic: z.string().optional().nullable(),
  trainerId: z.string().optional().nullable(),
  departmentId: z.string().min(1, 'Department ID is required'),
  academicYearId: z.string().min(1, 'Academic year ID is required'),
  batchIds: z.array(z.string()).min(1, 'At least one batch is required'),
  status: z.enum(['SCHEDULED', 'ONGOING', 'COMPLETED', 'CANCELLED']).optional(),
});

const updateSessionSchema = z.object({
  date: z.string().optional(),
  sessionType: z.enum(['FORENOON', 'AFTERNOON']).optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  subject: z.string().optional(),
  topic: z.string().optional().nullable(),
  trainerId: z.string().optional().nullable(),
  departmentId: z.string().optional(),
  academicYearId: z.string().optional(),
  batchIds: z.array(z.string()).optional(),
  status: z.enum(['SCHEDULED', 'ONGOING', 'COMPLETED', 'CANCELLED']).optional(),
  attendanceStatus: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'LOCKED']).optional(),
});

function buildScopeFilter(user: { scopeType?: string | null; scopeValue?: string | null }) {
  if (!user.scopeType || user.scopeType === 'ALL') return {};
  if (user.scopeType === 'DEPARTMENT') return { departmentId: user.scopeValue! };
  if (user.scopeType === 'BATCH') {
    return {
      sessionBatches: {
        some: { batchId: user.scopeValue! },
      },
    };
  }
  return {};
}

// GET /
router.get(
  '/',
  authenticateToken,
  requirePermission('sessions.view'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
      const skip = (page - 1) * limit;

      const { date, departmentId, academicYearId, sessionType, trainerId, subject, status } = req.query;

      const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
      if (!user) throw new NotFoundError('User not found');

      const scopeFilter = buildScopeFilter(user);

      const where: Record<string, unknown> = {
        ...scopeFilter,
        ...(departmentId ? { departmentId: departmentId as string } : {}),
        ...(academicYearId ? { academicYearId: academicYearId as string } : {}),
        ...(sessionType ? { sessionType: sessionType as string } : {}),
        ...(trainerId ? { trainerId: trainerId as string } : {}),
        ...(status ? { status: status as string } : {}),
      };

      if (date) {
        const startDate = new Date(date as string);
        const endDate = new Date(date as string);
        endDate.setDate(endDate.getDate() + 1);
        where.date = { gte: startDate, lt: endDate };
      }

      if (subject) {
        where.subject = { contains: subject as string };
      }

      const [sessions, total] = await Promise.all([
        prisma.session.findMany({
          where,
          include: {
            trainer: {
              include: {
                user: {
                  select: { id: true, name: true, loginId: true },
                },
              },
            },
            department: true,
            academicYear: true,
            sessionBatches: {
              include: {
                batch: {
                  include: {
                    department: true,
                    academicYear: true,
                  },
                },
              },
            },
          },
          skip,
          take: limit,
          orderBy: [{ date: 'desc' }, { startTime: 'desc' }],
        }),
        prisma.session.count({ where }),
      ]);

      res.json({ sessions, total, page, limit });
    } catch (error) {
      next(error);
    }
  }
);

// POST /
router.post(
  '/',
  authenticateToken,
  requirePermission('sessions.create'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = createSessionSchema.safeParse(req.body);
      if (!parsed.success) {
        const errors: Record<string, string[]> = {};
        parsed.error.issues.forEach((issue) => {
          const key = issue.path.join('.');
          if (!errors[key]) errors[key] = [];
          errors[key].push(issue.message);
        });
        throw new ValidationError('Validation failed', errors);
      }

      const {
        date, sessionType, startTime, endTime, subject, topic,
        trainerId, departmentId, academicYearId, batchIds, status,
      } = parsed.data;

      const [department, academicYear] = await Promise.all([
        prisma.department.findUnique({ where: { id: departmentId } }),
        prisma.academicYear.findUnique({ where: { id: academicYearId } }),
      ]);

      if (!department) throw new NotFoundError('Department not found');
      if (!academicYear) throw new NotFoundError('Academic year not found');

      if (trainerId) {
        const trainer = await prisma.trainer.findUnique({ where: { id: trainerId } });
        if (!trainer) throw new NotFoundError('Trainer not found');
      }

      for (const batchId of batchIds) {
        const batch = await prisma.batch.findUnique({ where: { id: batchId } });
        if (!batch) throw new NotFoundError(`Batch ${batchId} not found`);
      }

      const sessionDate = new Date(date);

      const session = await prisma.session.create({
        data: {
          date: sessionDate,
          sessionType,
          startTime,
          endTime,
          subject,
          topic: topic ?? null,
          trainerId: trainerId ?? null,
          departmentId,
          academicYearId,
          status: status || 'SCHEDULED',
          sessionBatches: {
            create: batchIds.map((batchId) => ({ batchId })),
          },
        },
        include: {
          trainer: {
            include: {
              user: {
                select: { id: true, name: true, loginId: true },
              },
            },
          },
          department: true,
          academicYear: true,
          sessionBatches: {
            include: { batch: true },
          },
        },
      });

      await createAuditLog(prisma, {
        userId: req.user!.id,
        action: 'CREATE',
        entity: 'SESSION',
        entityId: session.id,
        newValue: { date, sessionType, subject, batchIds, trainerId },
      });

      res.status(201).json(session);
    } catch (error) {
      next(error);
    }
  }
);

// GET /:id
router.get(
  '/:id',
  authenticateToken,
  requirePermission('sessions.view'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);

      const session = await prisma.session.findUnique({
        where: { id },
        include: {
          trainer: {
            include: {
              user: {
                select: { id: true, name: true, loginId: true },
              },
            },
          },
          department: true,
          academicYear: true,
          sessionBatches: {
            include: {
              batch: {
                include: {
                  department: true,
                  academicYear: true,
                },
              },
            },
          },
          attendances: {
            select: { id: true, status: true },
          },
        },
      });

      if (!session) throw new NotFoundError('Session not found');

      const attendanceCount = session.attendances.length;
      const presentCount = session.attendances.filter((a) => a.status === 'PRESENT').length;
      const absentCount = session.attendances.filter((a) => a.status === 'ABSENT').length;
      const odCount = session.attendances.filter((a) => a.status === 'OD').length;
      const pendingCount = session.attendances.filter((a) => a.status === 'PENDING').length;

      const { attendances, ...sessionData } = session;

      res.json({
        ...sessionData,
        attendanceSummary: {
          total: attendanceCount,
          present: presentCount,
          absent: absentCount,
          od: odCount,
          pending: pendingCount,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// PATCH /:id
router.patch(
  '/:id',
  authenticateToken,
  requirePermission('sessions.update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);

      const existing = await prisma.session.findUnique({
        where: { id },
        include: { sessionBatches: { select: { batchId: true } } },
      });
      if (!existing) throw new NotFoundError('Session not found');

      const parsed = updateSessionSchema.safeParse(req.body);
      if (!parsed.success) {
        const errors: Record<string, string[]> = {};
        parsed.error.issues.forEach((issue) => {
          const key = issue.path.join('.');
          if (!errors[key]) errors[key] = [];
          errors[key].push(issue.message);
        });
        throw new ValidationError('Validation failed', errors);
      }

      const { batchIds, ...updateData } = parsed.data;

      if (updateData.departmentId) {
        const dept = await prisma.department.findUnique({ where: { id: updateData.departmentId } });
        if (!dept) throw new NotFoundError('Department not found');
      }
      if (updateData.academicYearId) {
        const ay = await prisma.academicYear.findUnique({ where: { id: updateData.academicYearId } });
        if (!ay) throw new NotFoundError('Academic year not found');
      }
      if (updateData.trainerId) {
        const trainer = await prisma.trainer.findUnique({ where: { id: updateData.trainerId } });
        if (!trainer) throw new NotFoundError('Trainer not found');
      }

      const session = await prisma.$transaction(async (tx) => {
        if (batchIds !== undefined) {
          await tx.sessionBatch.deleteMany({ where: { sessionId: id } });
          if (batchIds.length > 0) {
            await tx.sessionBatch.createMany({
              data: batchIds.map((batchId) => ({ sessionId: id, batchId })),
            });
          }
        }

        return tx.session.update({
          where: { id },
          data: {
            ...updateData,
            date: updateData.date ? new Date(updateData.date) : undefined,
          },
          include: {
            trainer: {
              include: {
                user: {
                  select: { id: true, name: true, loginId: true },
                },
              },
            },
            department: true,
            academicYear: true,
            sessionBatches: {
              include: { batch: true },
            },
          },
        });
      });

      await createAuditLog(prisma, {
        userId: req.user!.id,
        action: 'UPDATE',
        entity: 'SESSION',
        entityId: id,
        oldValue: {
          date: existing.date,
          sessionType: existing.sessionType,
          subject: existing.subject,
          status: existing.status,
          batchIds: existing.sessionBatches.map((sb) => sb.batchId),
        },
        newValue: { ...updateData, batchIds },
      });

      res.json(session);
    } catch (error) {
      next(error);
    }
  }
);

// GET /:id/attendance-summary
router.get(
  '/:id/attendance-summary',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);

      const session = await prisma.session.findUnique({ where: { id } });
      if (!session) throw new NotFoundError('Session not found');

      const attendances = await prisma.attendance.findMany({
        where: { sessionId: id },
        select: { status: true, isSubmitted: true },
      });

      const total = attendances.length;
      const present = attendances.filter((a) => a.status === 'PRESENT').length;
      const absent = attendances.filter((a) => a.status === 'ABSENT').length;
      const od = attendances.filter((a) => a.status === 'OD').length;
      const pending = attendances.filter((a) => a.status === 'PENDING').length;
      const submitted = attendances.filter((a) => a.isSubmitted).length;

      res.json({ total, present, absent, od, pending, submitted });
    } catch (error) {
      next(error);
    }
  }
);

export default router;

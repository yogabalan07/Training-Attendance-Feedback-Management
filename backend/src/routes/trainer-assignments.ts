import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { NotFoundError, ConflictError, ValidationError, ForbiddenError } from '../lib/errors';
import { createAuditLog } from '../lib/audit';
import { authenticateToken } from '../middleware/auth';
import { requirePermission } from '../middleware/authorize';

const router = Router();

const createAssignmentSchema = z.object({
  trainerId: z.string().min(1, 'Trainer ID is required'),
  batchId: z.string().min(1, 'Batch ID is required'),
  sessionId: z.string().optional().nullable(),
  departmentId: z.string().min(1, 'Department ID is required'),
  academicYearId: z.string().min(1, 'Academic year ID is required'),
});

function buildScopeFilter(user: { scopeType?: string | null; scopeValue?: string | null }) {
  if (!user.scopeType || user.scopeType === 'ALL') return {};
  if (user.scopeType === 'DEPARTMENT') return { departmentId: user.scopeValue! };
  if (user.scopeType === 'BATCH') return { batchId: user.scopeValue! };
  return {};
}

// GET /my-assignments
router.get(
  '/my-assignments',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
      if (!user) throw new NotFoundError('User not found');

      if (user.role !== 'EXTERNAL_TRAINER') {
        return res.json({ assignments: [], batches: [] });
      }

      const trainer = await prisma.trainer.findUnique({ where: { userId: user.id } });
      if (!trainer) {
        return res.json({ assignments: [], batches: [] });
      }

      const assignments = await prisma.trainerAssignment.findMany({
        where: { trainerId: trainer.id },
        include: {
          batch: {
            include: {
              department: true,
              academicYear: true,
            },
          },
          session: {
            select: {
              id: true,
              date: true,
              sessionType: true,
              subject: true,
              status: true,
            },
          },
          department: true,
          academicYear: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      const batchIds = new Set<string>();
      assignments.forEach((a) => batchIds.add(a.batchId));

      const batches = await prisma.batch.findMany({
        where: { id: { in: Array.from(batchIds) } },
        include: {
          department: true,
          academicYear: true,
        },
      });

      res.json({ assignments, batches });
    } catch (error) {
      next(error);
    }
  }
);

// GET /
router.get(
  '/',
  authenticateToken,
  requirePermission('trainer_assignments.view'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { trainerId, batchId, departmentId, sessionId, page: pageStr, limit: limitStr } = req.query;

      const page = Math.max(1, parseInt(pageStr as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(limitStr as string) || 20));
      const skip = (page - 1) * limit;

      const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
      if (!user) throw new NotFoundError('User not found');

      let scopeFilter: Record<string, unknown> = {};

      if (user.role === 'EXTERNAL_TRAINER') {
        const trainer = await prisma.trainer.findUnique({ where: { userId: user.id } });
        if (!trainer) {
          return res.json({ assignments: [], total: 0, page, limit });
        }
        scopeFilter = { trainerId: trainer.id };
      } else {
        scopeFilter = buildScopeFilter(user);
      }

      const where: Record<string, unknown> = {
        ...scopeFilter,
        ...(trainerId ? { trainerId: trainerId as string } : {}),
        ...(batchId ? { batchId: batchId as string } : {}),
        ...(departmentId ? { departmentId: departmentId as string } : {}),
        ...(sessionId ? { sessionId: sessionId as string } : {}),
      };

      const [assignments, total] = await Promise.all([
        prisma.trainerAssignment.findMany({
          where,
          include: {
            trainer: {
              include: {
                user: {
                  select: { id: true, name: true, loginId: true },
                },
              },
            },
            batch: {
              include: {
                department: true,
                academicYear: true,
              },
            },
            session: {
              select: {
                id: true,
                date: true,
                sessionType: true,
                subject: true,
                status: true,
              },
            },
            department: true,
            academicYear: true,
          },
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.trainerAssignment.count({ where }),
      ]);

      res.json({ assignments, total, page, limit });
    } catch (error) {
      next(error);
    }
  }
);

// POST /
router.post(
  '/',
  authenticateToken,
  requirePermission('trainer_assignments.create'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = createAssignmentSchema.safeParse(req.body);
      if (!parsed.success) {
        const errors: Record<string, string[]> = {};
        parsed.error.issues.forEach((issue) => {
          const key = issue.path.join('.');
          if (!errors[key]) errors[key] = [];
          errors[key].push(issue.message);
        });
        throw new ValidationError('Validation failed', errors);
      }

      const { trainerId, batchId, sessionId, departmentId, academicYearId } = parsed.data;

      const [trainer, batch, department, academicYear] = await Promise.all([
        prisma.trainer.findUnique({ where: { id: trainerId } }),
        prisma.batch.findUnique({ where: { id: batchId } }),
        prisma.department.findUnique({ where: { id: departmentId } }),
        prisma.academicYear.findUnique({ where: { id: academicYearId } }),
      ]);

      if (!trainer) throw new NotFoundError('Trainer not found');
      if (!batch) throw new NotFoundError('Batch not found');
      if (!department) throw new NotFoundError('Department not found');
      if (!academicYear) throw new NotFoundError('Academic year not found');

      if (trainer.type !== 'EXTERNAL') {
        throw new ValidationError('Only EXTERNAL trainers can be assigned', {
          trainerId: ['Only EXTERNAL trainers can be assigned to batches'],
        });
      }

      if (sessionId) {
        const session = await prisma.session.findUnique({ where: { id: sessionId } });
        if (!session) throw new NotFoundError('Session not found');
      }

      const existing = await prisma.trainerAssignment.findFirst({
        where: {
          trainerId,
          batchId,
          sessionId: sessionId ?? null,
        },
      });
      if (existing) throw new ConflictError('This trainer is already assigned to this batch');

      const assignment = await prisma.trainerAssignment.create({
        data: {
          trainerId,
          batchId,
          sessionId: sessionId ?? null,
          departmentId,
          academicYearId,
          assignedBy: req.user!.id,
        },
        include: {
          trainer: {
            include: {
              user: {
                select: { id: true, name: true, loginId: true },
              },
            },
          },
          batch: {
            include: {
              department: true,
              academicYear: true,
            },
          },
          session: {
            select: {
              id: true,
              date: true,
              sessionType: true,
              subject: true,
              status: true,
            },
          },
          department: true,
          academicYear: true,
        },
      });

      await createAuditLog(prisma, {
        userId: req.user!.id,
        action: 'CREATE',
        entity: 'TRAINER_ASSIGNMENT',
        entityId: assignment.id,
        newValue: { trainerId, batchId, sessionId, departmentId, academicYearId },
      });

      res.status(201).json(assignment);
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /:id
router.delete(
  '/:id',
  authenticateToken,
  requirePermission('trainer_assignments.delete'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);

      const existing = await prisma.trainerAssignment.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError('Trainer assignment not found');

      await prisma.trainerAssignment.delete({ where: { id } });

      await createAuditLog(prisma, {
        userId: req.user!.id,
        action: 'DELETE',
        entity: 'TRAINER_ASSIGNMENT',
        entityId: id,
        oldValue: {
          trainerId: existing.trainerId,
          batchId: existing.batchId,
          sessionId: existing.sessionId,
        },
      });

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

export default router;
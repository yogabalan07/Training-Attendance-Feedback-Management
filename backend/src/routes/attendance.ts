import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { NotFoundError, ForbiddenError, ValidationError } from '../lib/errors';
import { createAuditLog } from '../lib/audit';
import { authenticateToken } from '../middleware/auth';
import { requirePermission } from '../middleware/authorize';
import { stringify } from 'csv-stringify/sync';
import * as XLSX from 'xlsx';

const router = Router();

const markAttendanceSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
  studentId: z.string().min(1, 'Student ID is required'),
  status: z.enum(['PRESENT', 'ABSENT', 'OD', 'PENDING'], {
    errorMap: () => ({ message: 'Status must be PRESENT, ABSENT, OD, or PENDING' }),
  }),
});

const bulkMarkSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
  batchId: z.string().min(1, 'Batch ID is required'),
  attendances: z
    .array(
      z.object({
        studentId: z.string().min(1, 'Student ID is required'),
        status: z.enum(['PRESENT', 'ABSENT', 'OD', 'PENDING']),
      })
    )
    .min(1, 'At least one attendance record is required'),
});

const submitSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
  batchId: z.string().optional(),
});

const updateAttendanceSchema = z.object({
  status: z.enum(['PRESENT', 'ABSENT', 'OD', 'PENDING']).optional(),
  reason: z.string().optional().nullable(),
});

function buildScopeFilter(user: { scopeType?: string | null; scopeValue?: string | null }) {
  if (!user.scopeType || user.scopeType === 'ALL') return {};
  if (user.scopeType === 'DEPARTMENT') return { session: { departmentId: user.scopeValue! } };
  if (user.scopeType === 'BATCH') return { student: { batchId: user.scopeValue! } };
  return {};
}

async function checkPermission(userId: string, permissionName: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      roleRelation: {
        include: { permissions: { include: { permission: true } } },
      },
      userPermissions: { include: { permission: true } },
    },
  });
  if (!user) return false;
  const rolePerms = user.roleRelation?.permissions.map((rp) => rp.permission.name) || [];
  const directPerms = user.userPermissions.filter((up) => up.granted).map((up) => up.permission.name);
  return new Set([...rolePerms, ...directPerms]).has(permissionName);
}

async function getStudentIdFromUserId(userId: string): Promise<string | null> {
  const student = await prisma.student.findUnique({ where: { userId }, select: { id: true } });
  return student?.id ?? null;
}

async function getTrainerFromUserId(userId: string) {
  return prisma.trainer.findUnique({ where: { userId }, select: { id: true, type: true } });
}

async function verifyExternalTrainerAssignment(
  trainerId: string,
  sessionId: string,
  batchId?: string
): Promise<void> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { sessionBatches: { select: { batchId: true } } },
  });
  if (!session) throw new NotFoundError('Session not found');

  const sessionBatchIds = session.sessionBatches.map((sb) => sb.batchId);

  const assignment = await prisma.trainerAssignment.findFirst({
    where: {
      trainerId,
      OR: [
        { sessionId },
        { batchId: { in: sessionBatchIds } },
      ],
    },
  });

  if (!assignment) {
    throw new ForbiddenError('You are not assigned to this session or its batches');
  }

  if (batchId && !sessionBatchIds.includes(batchId)) {
    throw new ForbiddenError('The specified batch is not linked to this session');
  }
}

function parseDateParam(dateStr: string) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) throw new ValidationError('Invalid date format');
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  return { start, end };
}

// ─── GET / ─────────────────────────────────────────────
router.get(
  '/',
  authenticateToken,
  requirePermission('attendance.view'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new ForbiddenError();

      const {
        sessionId,
        studentId,
        batchId,
        departmentId,
        academicYearId,
        status,
        date,
        page: pageStr,
        limit: limitStr,
      } = req.query as Record<string, string | undefined>;

      const page = Math.max(1, parseInt(pageStr || '1', 10));
      const limit = Math.min(100, Math.max(1, parseInt(limitStr || '50', 10)));
      const skip = (page - 1) * limit;

      const conditions: Record<string, unknown>[] = [];

      if (sessionId) conditions.push({ sessionId });
      if (studentId) conditions.push({ studentId });
      if (status) conditions.push({ status });
      if (batchId) conditions.push({ student: { batchId } });
      if (departmentId) conditions.push({ session: { departmentId } });
      if (academicYearId) conditions.push({ session: { academicYearId } });
      if (date) {
        const { start, end } = parseDateParam(date);
        conditions.push({ session: { date: { gte: start, lte: end } } });
      }

      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      if (!user) throw new NotFoundError('User not found');

      const scopeFilter = buildScopeFilter(user);
      if (Object.keys(scopeFilter).length > 0) {
        conditions.push(scopeFilter);
      }

      if (req.user.role === 'STUDENT') {
        const sid = await getStudentIdFromUserId(req.user.id);
        if (!sid) throw new NotFoundError('Student profile not found');
        conditions.push({ studentId: sid });
      }

      if (req.user.role === 'EXTERNAL_TRAINER') {
        const trainer = await getTrainerFromUserId(req.user.id);
        if (!trainer) {
          return res.json({
            data: [],
            pagination: { page, limit, total: 0, totalPages: 0 },
          });
        }
        const assignments = await prisma.trainerAssignment.findMany({
          where: { trainerId: trainer.id },
          select: { batchId: true, sessionId: true },
        });
        const batchIds = [...new Set(assignments.map((a) => a.batchId))];
        const assignedSessionIds = [
          ...new Set(assignments.filter((a) => a.sessionId).map((a) => a.sessionId!)),
        ];
        const orConds: Record<string, unknown>[] = [];
        if (batchIds.length > 0) orConds.push({ student: { batchId: { in: batchIds } } });
        if (assignedSessionIds.length > 0) orConds.push({ sessionId: { in: assignedSessionIds } });
        if (orConds.length === 0) {
          return res.json({
            data: [],
            pagination: { page, limit, total: 0, totalPages: 0 },
          });
        }
        conditions.push({ OR: orConds });
      }

      const where = conditions.length > 0 ? { AND: conditions } : {};

      const [data, total] = await Promise.all([
        prisma.attendance.findMany({
          where,
          include: {
            student: {
              select: {
                id: true,
                registerNumber: true,
                name: true,
                batch: { select: { id: true, name: true } },
              },
            },
            session: {
              include: {
                department: { select: { id: true, name: true } },
                academicYear: { select: { id: true, year: true, label: true } },
                trainer: {
                  include: { user: { select: { id: true, name: true } } },
                },
              },
            },
            markedByUser: { select: { id: true, name: true } },
          },
          orderBy: { markedAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.attendance.count({ where }),
      ]);

      res.json({ data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
    } catch (error) {
      next(error);
    }
  }
);

// ─── GET /student/:studentId ───────────────────────────
router.get(
  '/student/:studentId',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new ForbiddenError();
      const { studentId } = req.params;

      const student = await prisma.student.findUnique({ where: { id: studentId } });
      if (!student) throw new NotFoundError('Student not found');

      if (req.user.role === 'STUDENT') {
        const ownSid = await getStudentIdFromUserId(req.user.id);
        if (ownSid !== studentId) {
          throw new ForbiddenError('Students can only view their own attendance');
        }
      } else {
        const hasPermission = await checkPermission(req.user.id, 'attendance.view');
        if (!hasPermission) {
          throw new ForbiddenError('Missing required permission: attendance.view');
        }

        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        if (user) {
          if (user.scopeType === 'DEPARTMENT' && user.scopeValue && student.departmentId !== user.scopeValue) {
            throw new ForbiddenError('Access denied: department scope mismatch');
          }
          if (user.scopeType === 'BATCH' && user.scopeValue && student.batchId !== user.scopeValue) {
            throw new ForbiddenError('Access denied: batch scope mismatch');
          }
        }
      }

      if (req.user.role === 'EXTERNAL_TRAINER') {
        const trainer = await getTrainerFromUserId(req.user.id);
        if (trainer) {
          const assignment = await prisma.trainerAssignment.findFirst({
            where: {
              trainerId: trainer.id,
              batchId: student.batchId,
            },
          });
          if (!assignment) {
            throw new ForbiddenError('You are not assigned to this student\'s batch');
          }
        }
      }

      const data = await prisma.attendance.findMany({
        where: { studentId },
        include: {
          session: {
            include: {
              department: { select: { id: true, name: true } },
              academicYear: { select: { id: true, year: true, label: true } },
              trainer: { include: { user: { select: { id: true, name: true } } } },
            },
          },
          markedByUser: { select: { id: true, name: true } },
        },
        orderBy: { markedAt: 'desc' },
      });

      res.json({ data });
    } catch (error) {
      next(error);
    }
  }
);

// ─── POST /mark ────────────────────────────────────────
router.post(
  '/mark',
  authenticateToken,
  requirePermission('attendance.mark'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new ForbiddenError();

      const parsed = markAttendanceSchema.safeParse(req.body);
      if (!parsed.success) {
        const errors: Record<string, string[]> = {};
        parsed.error.issues.forEach((issue) => {
          const key = issue.path.join('.');
          if (!errors[key]) errors[key] = [];
          errors[key].push(issue.message);
        });
        throw new ValidationError('Validation failed', errors);
      }

      const { sessionId, studentId, status } = parsed.data;

      const session = await prisma.session.findUnique({ where: { id: sessionId } });
      if (!session) throw new NotFoundError('Session not found');
      if (session.attendanceStatus === 'LOCKED') {
        throw new ForbiddenError('Cannot mark attendance for a locked session');
      }

      const student = await prisma.student.findUnique({ where: { id: studentId } });
      if (!student) throw new NotFoundError('Student not found');

      if (req.user.role === 'EXTERNAL_TRAINER') {
        const trainer = await getTrainerFromUserId(req.user.id);
        if (!trainer) throw new ForbiddenError('Trainer profile not found');
        await verifyExternalTrainerAssignment(trainer.id, sessionId);
      }

      const existing = await prisma.attendance.findUnique({
        where: { sessionId_studentId: { sessionId, studentId } },
      });

      const attendance = await prisma.attendance.upsert({
        where: { sessionId_studentId: { sessionId, studentId } },
        create: {
          sessionId,
          studentId,
          status,
          markedBy: req.user.id,
        },
        update: {
          status,
          markedBy: req.user.id,
          markedAt: new Date(),
        },
        include: {
          student: { select: { id: true, registerNumber: true, name: true } },
          session: true,
          markedByUser: { select: { id: true, name: true } },
        },
      });

      await createAuditLog(prisma, {
        userId: req.user.id,
        action: existing ? 'ATTENDANCE_UPDATE' : 'ATTENDANCE_MARK',
        entity: 'ATTENDANCE',
        entityId: attendance.id,
        oldValue: existing ? { status: existing.status } : undefined,
        newValue: { status, sessionId, studentId },
      });

      res.status(existing ? 200 : 201).json(attendance);
    } catch (error) {
      next(error);
    }
  }
);

// ─── POST /bulk-mark ───────────────────────────────────
router.post(
  '/bulk-mark',
  authenticateToken,
  requirePermission('attendance.mark'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new ForbiddenError();

      const parsed = bulkMarkSchema.safeParse(req.body);
      if (!parsed.success) {
        const errors: Record<string, string[]> = {};
        parsed.error.issues.forEach((issue) => {
          const key = issue.path.join('.');
          if (!errors[key]) errors[key] = [];
          errors[key].push(issue.message);
        });
        throw new ValidationError('Validation failed', errors);
      }

      const { sessionId, batchId, attendances } = parsed.data;

      const session = await prisma.session.findUnique({ where: { id: sessionId } });
      if (!session) throw new NotFoundError('Session not found');
      if (session.attendanceStatus === 'LOCKED') {
        throw new ForbiddenError('Cannot mark attendance for a locked session');
      }

      const batch = await prisma.batch.findUnique({ where: { id: batchId } });
      if (!batch) throw new NotFoundError('Batch not found');

      if (req.user.role === 'EXTERNAL_TRAINER') {
        const trainer = await getTrainerFromUserId(req.user.id);
        if (!trainer) throw new ForbiddenError('Trainer profile not found');
        await verifyExternalTrainerAssignment(trainer.id, sessionId, batchId);
      }

      const studentIds = attendances.map((a) => a.studentId);
      const validStudents = await prisma.student.findMany({
        where: { id: { in: studentIds }, batchId, isActive: true },
        select: { id: true },
      });
      const validStudentIds = new Set(validStudents.map((s) => s.id));
      const invalidIds = studentIds.filter((id) => !validStudentIds.has(id));
      if (invalidIds.length > 0) {
        throw new ValidationError('Some students are not in the specified batch or are inactive', {
          studentIds: invalidIds,
        });
      }

      const results = await prisma.$transaction(async (tx) => {
        const created: Array<{ studentId: string; status: string; existed: boolean }> = [];

        for (const item of attendances) {
          const existing = await tx.attendance.findUnique({
            where: { sessionId_studentId: { sessionId, studentId: item.studentId } },
          });

          await tx.attendance.upsert({
            where: { sessionId_studentId: { sessionId, studentId: item.studentId } },
            create: {
              sessionId,
              studentId: item.studentId,
              status: item.status,
              markedBy: req.user!.id,
            },
            update: {
              status: item.status,
              markedBy: req.user!.id,
              markedAt: new Date(),
            },
          });

          created.push({
            studentId: item.studentId,
            status: item.status,
            existed: !!existing,
          });
        }

        return created;
      });

      for (const r of results) {
        await createAuditLog(prisma, {
          userId: req.user.id,
          action: r.existed ? 'ATTENDANCE_UPDATE' : 'ATTENDANCE_MARK',
          entity: 'ATTENDANCE',
          entityId: r.studentId,
          newValue: { status: r.status, sessionId, studentId: r.studentId },
        });
      }

      res.status(201).json({ data: results, total: results.length });
    } catch (error) {
      next(error);
    }
  }
);

// ─── POST /submit ──────────────────────────────────────
router.post(
  '/submit',
  authenticateToken,
  requirePermission('attendance.mark'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new ForbiddenError();

      const parsed = submitSchema.safeParse(req.body);
      if (!parsed.success) {
        const errors: Record<string, string[]> = {};
        parsed.error.issues.forEach((issue) => {
          const key = issue.path.join('.');
          if (!errors[key]) errors[key] = [];
          errors[key].push(issue.message);
        });
        throw new ValidationError('Validation failed', errors);
      }

      const { sessionId, batchId } = parsed.data;

      const session = await prisma.session.findUnique({ where: { id: sessionId } });
      if (!session) throw new NotFoundError('Session not found');
      if (session.attendanceStatus === 'LOCKED') {
        throw new ForbiddenError('Cannot submit attendance for a locked session');
      }

      if (req.user.role === 'EXTERNAL_TRAINER') {
        const trainer = await getTrainerFromUserId(req.user.id);
        if (!trainer) throw new ForbiddenError('Trainer profile not found');
        await verifyExternalTrainerAssignment(trainer.id, sessionId, batchId);
      }

      const where: Record<string, unknown> = { sessionId };
      if (batchId) {
        where.student = { batchId };
      }

      const now = new Date();

      await prisma.$transaction(async (tx) => {
        await tx.attendance.updateMany({
          where,
          data: {
            isSubmitted: true,
            submittedAt: now,
            submittedBy: req.user!.id,
          },
        });

        await tx.session.update({
          where: { id: sessionId },
          data: { attendanceStatus: 'SUBMITTED' },
        });
      });

      await createAuditLog(prisma, {
        userId: req.user.id,
        action: 'ATTENDANCE_SUBMIT',
        entity: 'SESSION',
        entityId: sessionId,
        newValue: { submittedAt: now, batchId: batchId || 'all' },
      });

      res.json({ message: 'Attendance submitted successfully', submittedAt: now });
    } catch (error) {
      next(error);
    }
  }
);

// ─── PATCH /:id ────────────────────────────────────────
router.patch(
  '/:id',
  authenticateToken,
  requirePermission('attendance.update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new ForbiddenError();
      const { id } = req.params;

      const existing = await prisma.attendance.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError('Attendance record not found');

      const session = await prisma.session.findUnique({
        where: { id: existing.sessionId },
        select: { attendanceStatus: true },
      });
      if (!session) throw new NotFoundError('Session not found');

      if (session.attendanceStatus === 'LOCKED') {
        throw new ForbiddenError('Cannot update attendance for a locked session');
      }

      const parsed = updateAttendanceSchema.safeParse(req.body);
      if (!parsed.success) {
        const errors: Record<string, string[]> = {};
        parsed.error.issues.forEach((issue) => {
          const key = issue.path.join('.');
          if (!errors[key]) errors[key] = [];
          errors[key].push(issue.message);
        });
        throw new ValidationError('Validation failed', errors);
      }

      const updateData: Record<string, unknown> = {};
      if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
      if (parsed.data.reason !== undefined) updateData.reason = parsed.data.reason;

      if (Object.keys(updateData).length === 0) {
        throw new ValidationError('No fields to update');
      }

      const attendance = await prisma.attendance.update({
        where: { id },
        data: updateData,
        include: {
          student: { select: { id: true, registerNumber: true, name: true } },
          session: true,
          markedByUser: { select: { id: true, name: true } },
        },
      });

      await createAuditLog(prisma, {
        userId: req.user.id,
        action: 'ATTENDANCE_UPDATE',
        entity: 'ATTENDANCE',
        entityId: id,
        oldValue: { status: existing.status, reason: existing.reason },
        newValue: updateData,
      });

      res.json(attendance);
    } catch (error) {
      next(error);
    }
  }
);

// ─── GET /export ───────────────────────────────────────
router.get(
  '/export',
  authenticateToken,
  requirePermission('attendance.export'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new ForbiddenError();

      const { departmentId, academicYearId, batchId, sessionId, startDate, endDate, format } =
        req.query as Record<string, string | undefined>;

      const conditions: Record<string, unknown>[] = [];

      if (sessionId) conditions.push({ sessionId });
      if (batchId) conditions.push({ student: { batchId } });
      if (departmentId) conditions.push({ session: { departmentId } });
      if (academicYearId) conditions.push({ session: { academicYearId } });
      if (startDate || endDate) {
        const dateFilter: Record<string, Date> = {};
        if (startDate) dateFilter.gte = new Date(startDate);
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          dateFilter.lte = end;
        }
        conditions.push({ session: { date: dateFilter } });
      }

      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      if (user) {
        const scopeFilter = buildScopeFilter(user);
        if (Object.keys(scopeFilter).length > 0) conditions.push(scopeFilter);
      }

      if (req.user.role === 'STUDENT') {
        const sid = await getStudentIdFromUserId(req.user.id);
        if (sid) conditions.push({ studentId: sid });
      }

      if (req.user.role === 'EXTERNAL_TRAINER') {
        const trainer = await getTrainerFromUserId(req.user.id);
        if (trainer) {
          const assignments = await prisma.trainerAssignment.findMany({
            where: { trainerId: trainer.id },
            select: { batchId: true, sessionId: true },
          });
          const batchIds = [...new Set(assignments.map((a) => a.batchId))];
          const sIds = [...new Set(assignments.filter((a) => a.sessionId).map((a) => a.sessionId!))];
          const orConds: Record<string, unknown>[] = [];
          if (batchIds.length > 0) orConds.push({ student: { batchId: { in: batchIds } } });
          if (sIds.length > 0) orConds.push({ sessionId: { in: sIds } });
          if (orConds.length > 0) conditions.push({ OR: orConds });
        }
      }

      const where = conditions.length > 0 ? { AND: conditions } : {};

      const records = await prisma.attendance.findMany({
        where,
        include: {
          student: {
            select: {
              registerNumber: true,
              name: true,
              batch: { select: { name: true } },
            },
          },
          session: {
            include: {
              department: { select: { name: true } },
              academicYear: { select: { year: true, label: true } },
            },
          },
          markedByUser: { select: { name: true } },
        },
        orderBy: [{ session: { date: 'desc' } }, { markedAt: 'desc' }],
      });

      const rows = records.map((r) => ({
        Date: new Date(r.session.date).toISOString().split('T')[0],
        'Session Type': r.session.sessionType,
        Department: r.session.department.name,
        'Academic Year': r.session.academicYear.label || `Year ${r.session.academicYear.year}`,
        Batch: r.student.batch.name,
        'Register Number': r.student.registerNumber,
        'Student Name': r.student.name,
        Status: r.status,
        'Marked By': r.markedByUser.name,
        'Marked At': new Date(r.markedAt).toISOString(),
      }));

      const ext = (format || 'csv').toLowerCase();

      if (ext === 'xlsx') {
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader('Content-Disposition', 'attachment; filename=attendance.xlsx');
        res.send(Buffer.from(buf));
      } else {
        const csv = stringify(rows, { header: true });
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=attendance.csv');
        res.send('\uFEFF' + csv);
      }
    } catch (error) {
      next(error);
    }
  }
);

// ─── GET /shortage ─────────────────────────────────────
router.get(
  '/shortage',
  authenticateToken,
  requirePermission('attendance.view'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new ForbiddenError();

      const { departmentId, academicYearId, batchId } = req.query as Record<
        string,
        string | undefined
      >;

      const setting = await prisma.systemSetting.findUnique({
        where: { key: 'min_attendance_percentage' },
      });
      const minPercentage = parseFloat(setting?.value || '75');

      const studentWhere: Record<string, unknown> = { isActive: true };
      if (departmentId) studentWhere.departmentId = departmentId;
      if (academicYearId) studentWhere.academicYearId = academicYearId;
      if (batchId) studentWhere.batchId = batchId;

      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      if (user) {
        if (user.scopeType === 'DEPARTMENT' && user.scopeValue) {
          studentWhere.departmentId = user.scopeValue;
        }
        if (user.scopeType === 'BATCH' && user.scopeValue) {
          studentWhere.batchId = user.scopeValue;
        }
      }

      const students = await prisma.student.findMany({
        where: studentWhere,
        include: {
          attendances: { select: { status: true } },
          batch: { select: { id: true, name: true } },
          department: { select: { id: true, name: true } },
          academicYear: { select: { id: true, year: true, label: true } },
        },
      });

      const shortageStudents = students
        .map((student) => {
          const total = student.attendances.length;
          const present = student.attendances.filter((a) => a.status === 'PRESENT').length;
          const od = student.attendances.filter((a) => a.status === 'OD').length;
          const absent = student.attendances.filter((a) => a.status === 'ABSENT').length;
          const pending = student.attendances.filter((a) => a.status === 'PENDING').length;
          const attended = present + od;
          const percentage = total > 0 ? (attended / total) * 100 : 0;

          return {
            studentId: student.id,
            registerNumber: student.registerNumber,
            name: student.name,
            batchId: student.batch.id,
            batchName: student.batch.name,
            departmentId: student.department.id,
            departmentName: student.department.name,
            academicYearId: student.academicYear.id,
            academicYearLabel:
              student.academicYear.label || `Year ${student.academicYear.year}`,
            totalSessions: total,
            present,
            absent,
            od,
            pending,
            percentage: Math.round(percentage * 100) / 100,
          };
        })
        .filter((s) => s.percentage < minPercentage)
        .sort((a, b) => a.percentage - b.percentage);

      res.json({
        minPercentage,
        totalShortage: shortageStudents.length,
        data: shortageStudents,
      });
    } catch (error) {
      next(error);
    }
  }
);

// ─── GET /submission-status ────────────────────────────
router.get(
  '/submission-status',
  authenticateToken,
  requirePermission('attendance.view'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new ForbiddenError();

      const { departmentId, academicYearId, date } = req.query as Record<
        string,
        string | undefined
      >;

      const sessionWhere: Record<string, unknown> = {};

      if (departmentId) sessionWhere.departmentId = departmentId;
      if (academicYearId) sessionWhere.academicYearId = academicYearId;
      if (date) {
        const { start, end } = parseDateParam(date);
        sessionWhere.date = { gte: start, lte: end };
      }

      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      if (user) {
        if (user.scopeType === 'DEPARTMENT' && user.scopeValue) {
          sessionWhere.departmentId = user.scopeValue;
        }
        if (user.scopeType === 'BATCH' && user.scopeValue) {
          sessionWhere.sessionBatches = {
            some: { batchId: user.scopeValue },
          };
        }
      }

      if (req.user.role === 'EXTERNAL_TRAINER') {
        const trainer = await getTrainerFromUserId(req.user.id);
        if (trainer) {
          const assignments = await prisma.trainerAssignment.findMany({
            where: { trainerId: trainer.id },
            select: { batchId: true, sessionId: true },
          });
          const batchIds = [...new Set(assignments.map((a) => a.batchId))];
          const sIds = [...new Set(assignments.filter((a) => a.sessionId).map((a) => a.sessionId!))];
          const orConds: Record<string, unknown>[] = [];
          if (batchIds.length > 0) {
            orConds.push({ sessionBatches: { some: { batchId: { in: batchIds } } } });
          }
          if (sIds.length > 0) orConds.push({ id: { in: sIds } });
          if (orConds.length > 0) {
            sessionWhere.OR = orConds;
          }
        }
      }

      const sessions = await prisma.session.findMany({
        where: sessionWhere,
        include: {
          department: { select: { id: true, name: true } },
          academicYear: { select: { id: true, year: true, label: true } },
          trainer: { include: { user: { select: { id: true, name: true } } } },
          sessionBatches: {
            include: {
              batch: {
                include: {
                  students: { where: { isActive: true }, select: { id: true } },
                },
              },
            },
          },
          attendances: {
            select: { id: true, isSubmitted: true },
          },
        },
        orderBy: [{ date: 'desc' }, { startTime: 'desc' }],
      });

      const data = sessions.map((session) => {
        const totalExpected = session.sessionBatches.reduce(
          (sum, sb) => sum + sb.batch.students.length,
          0
        );
        const submittedCount = session.attendances.filter((a) => a.isSubmitted).length;
        const totalMarked = session.attendances.length;

        return {
          sessionId: session.id,
          date: session.date,
          sessionType: session.sessionType,
          subject: session.subject,
          trainer: session.trainer?.user?.name || null,
          department: session.department.name,
          academicYear: session.academicYear.label || `Year ${session.academicYear.year}`,
          totalExpectedStudents: totalExpected,
          totalMarked,
          submittedCount,
          attendanceStatus: session.attendanceStatus,
        };
      });

      res.json({ data });
    } catch (error) {
      next(error);
    }
  }
);

export default router;

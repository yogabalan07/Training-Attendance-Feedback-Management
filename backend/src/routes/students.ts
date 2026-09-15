import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { NotFoundError, ConflictError, ValidationError, ForbiddenError } from '../lib/errors';
import { createAuditLog } from '../lib/audit';
import { authenticateToken } from '../middleware/auth';
import { requirePermission } from '../middleware/authorize';
import { hashPassword } from '../lib/auth';

const router = Router();

const createStudentSchema = z.object({
  registerNumber: z.string().min(1, 'Register number is required'),
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email').optional(),
  phone: z.string().optional(),
  departmentId: z.string().min(1, 'Department ID is required'),
  academicYearId: z.string().min(1, 'Academic year ID is required'),
  batchId: z.string().min(1, 'Batch ID is required'),
  createUser: z.boolean().optional().default(false),
});

const updateStudentSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  departmentId: z.string().min(1).optional(),
  academicYearId: z.string().min(1).optional(),
  batchId: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

function buildScopeFilter(user: { scopeType?: string | null; scopeValue?: string | null }) {
  if (!user.scopeType || user.scopeType === 'ALL') return {};
  if (user.scopeType === 'DEPARTMENT') return { departmentId: user.scopeValue! };
  if (user.scopeType === 'BATCH') return { batchId: user.scopeValue! };
  return {};
}

async function buildScopeFilterAsync(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.scopeType || user.scopeType === 'ALL') return {};
  if (user.scopeType === 'DEPARTMENT' && user.scopeValue) {
    const dept = await prisma.department.findFirst({ where: { OR: [{ id: user.scopeValue }, { name: user.scopeValue }] } });
    return dept ? { departmentId: dept.id } : { departmentId: '__NONE__' };
  }
  if (user.scopeType === 'BATCH' && user.scopeValue) {
    const batch = await prisma.batch.findFirst({ where: { OR: [{ id: user.scopeValue }, { name: user.scopeValue }] } });
    return batch ? { batchId: batch.id } : { batchId: '__NONE__' };
  }
  return {};
}

// GET /
router.get(
  '/',
  authenticateToken,
  requirePermission('students.view'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
      const skip = (page - 1) * limit;

      const { search, departmentId, academicYearId, batchId, registerNumber } = req.query;

      const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
      if (!user) throw new NotFoundError('User not found');

      const scopeFilter = await buildScopeFilterAsync(user.id);

      const where: Record<string, unknown> = {
        ...scopeFilter,
        ...(departmentId ? { departmentId: departmentId as string } : {}),
        ...(academicYearId ? { academicYearId: academicYearId as string } : {}),
        ...(batchId ? { batchId: batchId as string } : {}),
        ...(registerNumber ? { registerNumber: registerNumber as string } : {}),
      };

      if (scopeFilter.departmentId && departmentId && scopeFilter.departmentId !== departmentId) {
        return res.json({ students: [], total: 0, page, limit });
      }
      if (scopeFilter.batchId && batchId && scopeFilter.batchId !== batchId) {
        return res.json({ students: [], total: 0, page, limit });
      }

      if (search) {
        where.OR = [
          { name: { contains: search as string } },
          { registerNumber: { contains: search as string } },
          { email: { contains: search as string } },
        ];
      }

      const [students, total] = await Promise.all([
        prisma.student.findMany({
          where,
          include: {
            department: true,
            academicYear: true,
            batch: true,
            user: {
              select: { id: true, loginId: true, name: true, role: true, isActive: true },
            },
          },
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.student.count({ where }),
      ]);

      res.json({ students, total, page, limit });
    } catch (error) {
      next(error);
    }
  }
);

// POST /
router.post(
  '/',
  authenticateToken,
  requirePermission('students.create'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = createStudentSchema.safeParse(req.body);
      if (!parsed.success) {
        const errors: Record<string, string[]> = {};
        parsed.error.issues.forEach((issue) => {
          const key = issue.path.join('.');
          if (!errors[key]) errors[key] = [];
          errors[key].push(issue.message);
        });
        throw new ValidationError('Validation failed', errors);
      }

      const { registerNumber, name, email, phone, departmentId, academicYearId, batchId, createUser } = parsed.data;

      const existing = await prisma.student.findUnique({ where: { registerNumber } });
      if (existing) throw new ConflictError('A student with this register number already exists');

      const [department, academicYear, batch] = await Promise.all([
        prisma.department.findUnique({ where: { id: departmentId } }),
        prisma.academicYear.findUnique({ where: { id: academicYearId } }),
        prisma.batch.findUnique({ where: { id: batchId } }),
      ]);

      if (!department) throw new NotFoundError('Department not found');
      if (!academicYear) throw new NotFoundError('Academic year not found');
      if (!batch) throw new NotFoundError('Batch not found');

      let userId: string | undefined;

      if (createUser) {
        const loginId = email || registerNumber;
        const existingUser = await prisma.user.findUnique({ where: { loginId } });
        if (existingUser) throw new ConflictError('A user account with this login ID already exists');

        const passwordHash = await hashPassword(registerNumber);
        const newUser = await prisma.user.create({
          data: {
            loginId,
            passwordHash,
            name,
            role: 'STUDENT',
            departmentId,
            academicYearId,
            batchId,
          },
        });
        userId = newUser.id;
      }

      const student = await prisma.student.create({
        data: {
          registerNumber,
          name,
          email: email ?? null,
          phone: phone ?? null,
          departmentId,
          academicYearId,
          batchId,
          userId: userId ?? null,
        },
        include: {
          department: true,
          academicYear: true,
          batch: true,
          user: {
            select: { id: true, loginId: true, name: true, role: true, isActive: true },
          },
        },
      });

      await createAuditLog(prisma, {
        userId: req.user!.id,
        action: 'CREATE',
        entity: 'STUDENT',
        entityId: student.id,
        newValue: { registerNumber, name, departmentId, academicYearId, batchId },
      });

      res.status(201).json(student);
    } catch (error) {
      next(error);
    }
  }
);

// GET /:id
router.get(
  '/:id',
  authenticateToken,
  requirePermission('students.view'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);

      const student = await prisma.student.findUnique({
        where: { id },
        include: {
          department: true,
          academicYear: true,
          batch: true,
          user: {
            select: { id: true, loginId: true, name: true, role: true, isActive: true },
          },
          attendances: {
            include: {
              session: {
                select: { id: true, date: true, sessionType: true, subject: true, status: true },
              },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!student) throw new NotFoundError('Student not found');

      const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
      if (user && user.scopeType === 'DEPARTMENT' && user.scopeValue) {
        const dept = await prisma.department.findFirst({ where: { OR: [{ id: user.scopeValue }, { name: user.scopeValue }] } });
        if (dept && student.departmentId !== dept.id) {
          throw new ForbiddenError('Access denied: department scope mismatch');
        }
      }

      if (user && user.scopeType === 'BATCH' && user.scopeValue) {
        const batch = await prisma.batch.findFirst({ where: { OR: [{ id: user.scopeValue }, { name: user.scopeValue }] } });
        if (batch && student.batchId !== batch.id) {
          throw new ForbiddenError('Access denied: batch scope mismatch');
        }
      }

      res.json(student);
    } catch (error) {
      next(error);
    }
  }
);

// PATCH /:id
router.patch(
  '/:id',
  authenticateToken,
  requirePermission('students.update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);

      const existing = await prisma.student.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError('Student not found');

      const parsed = updateStudentSchema.safeParse(req.body);
      if (!parsed.success) {
        const errors: Record<string, string[]> = {};
        parsed.error.issues.forEach((issue) => {
          const key = issue.path.join('.');
          if (!errors[key]) errors[key] = [];
          errors[key].push(issue.message);
        });
        throw new ValidationError('Validation failed', errors);
      }

      const data = parsed.data;

      if (data.departmentId) {
        const dept = await prisma.department.findUnique({ where: { id: data.departmentId } });
        if (!dept) throw new NotFoundError('Department not found');
      }
      if (data.academicYearId) {
        const ay = await prisma.academicYear.findUnique({ where: { id: data.academicYearId } });
        if (!ay) throw new NotFoundError('Academic year not found');
      }
      if (data.batchId) {
        const batch = await prisma.batch.findUnique({ where: { id: data.batchId } });
        if (!batch) throw new NotFoundError('Batch not found');
      }

      const student = await prisma.student.update({
        where: { id },
        data,
        include: {
          department: true,
          academicYear: true,
          batch: true,
          user: {
            select: { id: true, loginId: true, name: true, role: true, isActive: true },
          },
        },
      });

      await createAuditLog(prisma, {
        userId: req.user!.id,
        action: 'UPDATE',
        entity: 'STUDENT',
        entityId: id,
        oldValue: {
          name: existing.name,
          email: existing.email,
          phone: existing.phone,
          departmentId: existing.departmentId,
          academicYearId: existing.academicYearId,
          batchId: existing.batchId,
        },
        newValue: data,
      });

      res.json(student);
    } catch (error) {
      next(error);
    }
  }
);

// GET /:id/attendance
router.get(
  '/:id/attendance',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);

      const student = await prisma.student.findUnique({ where: { id } });
      if (!student) throw new NotFoundError('Student not found');

      if (req.user!.role === 'STUDENT') {
        const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
        if (!user || student.userId !== user.id) {
          throw new ForbiddenError('Students can only view their own attendance');
        }
      } else {
        const hasPermission = await checkPermission(req.user!.id, 'attendance.view');
        if (!hasPermission) {
          throw new ForbiddenError('Missing required permission: attendance.view');
        }

        const requestingUser = await prisma.user.findUnique({ where: { id: req.user!.id } });
        if (requestingUser && requestingUser.scopeType === 'DEPARTMENT' && requestingUser.scopeValue) {
          if (student.departmentId !== requestingUser.scopeValue) {
            throw new ForbiddenError('Access denied: department scope mismatch');
          }
        }
        if (requestingUser && requestingUser.scopeType === 'BATCH' && requestingUser.scopeValue) {
          if (student.batchId !== requestingUser.scopeValue) {
            throw new ForbiddenError('Access denied: batch scope mismatch');
          }
        }
      }

      const attendances = await prisma.attendance.findMany({
        where: { studentId: id },
        include: {
          session: {
            select: {
              id: true,
              date: true,
              sessionType: true,
              subject: true,
              topic: true,
              startTime: true,
              endTime: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      res.json(attendances);
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

      const student = await prisma.student.findUnique({ where: { id } });
      if (!student) throw new NotFoundError('Student not found');

      const attendances = await prisma.attendance.findMany({
        where: { studentId: id },
        include: {
          session: {
            select: { id: true, status: true, attendanceStatus: true },
          },
        },
      });

      let totalSessions = attendances.length;
      let present = 0;
      let absent = 0;
      let od = 0;
      let pending = 0;

      for (const att of attendances) {
        switch (att.status) {
          case 'PRESENT':
            present++;
            break;
          case 'ABSENT':
            absent++;
            break;
          case 'OD':
            od++;
            break;
          case 'PENDING':
            pending++;
            break;
        }
      }

      const denominator = totalSessions - od;
      const attendancePercentage = denominator > 0 ? (present / denominator) * 100 : 0;

      res.json({
        studentId: id,
        totalSessions,
        present,
        absent,
        od,
        pending,
        attendancePercentage: Math.round(attendancePercentage * 100) / 100,
      });
    } catch (error) {
      next(error);
    }
  }
);

async function checkPermission(userId: string, permissionName: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      roleRelation: {
        include: {
          permissions: {
            include: { permission: true },
          },
        },
      },
      userPermissions: {
        include: { permission: true },
      },
    },
  });

  if (!user) return false;

  const rolePermissions = user.roleRelation?.permissions.map(
    (rp) => rp.permission.name
  ) || [];
  const directPermissions = user.userPermissions
    .filter((up) => up.granted)
    .map((up) => up.permission.name);
  const allPermissions = new Set([...rolePermissions, ...directPermissions]);

  return allPermissions.has(permissionName);
}

export default router;

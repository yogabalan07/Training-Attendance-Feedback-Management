import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { NotFoundError, ConflictError } from '../lib/errors';
import { createAuditLog } from '../lib/audit';
import { authenticateToken } from '../middleware/auth';
import { requirePermission } from '../middleware/authorize';
import { validate } from '../middleware/validate';

const router = Router();

const createDepartmentSchema = z.object({
  name: z.string().min(1, 'Department name is required'),
  code: z.string().optional(),
});

const updateDepartmentSchema = createDepartmentSchema.partial().extend({
  isActive: z.boolean().optional(),
});

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === 'P2002'
  );
}

router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const departmentScope = (req as any).departmentScope as string | undefined;

      const where: Prisma.DepartmentWhereInput = { isActive: true };
      if (departmentScope) {
        where.name = departmentScope;
      }

      const departments = await prisma.department.findMany({
        where,
        orderBy: { name: 'asc' },
        include: {
          _count: {
            select: { users: true, batches: true, academicYears: true },
          },
        },
      });

      res.json({ departments });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/',
  authenticateToken,
  requirePermission('departments.create'),
  validate(createDepartmentSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, code } = req.body;

      const existing = await prisma.department.findUnique({ where: { name } });
      if (existing) {
        throw new ConflictError('Department with this name already exists');
      }

      if (code) {
        const existingCode = await prisma.department.findUnique({
          where: { code },
        });
        if (existingCode) {
          throw new ConflictError('Department with this code already exists');
        }
      }

      const department = await prisma.department.create({
        data: { name, code: code ?? null },
      });

      await createAuditLog(prisma, {
        userId: req.user!.id,
        action: 'CREATE',
        entity: 'DEPARTMENT',
        entityId: department.id,
        newValue: { name: department.name, code: department.code },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.status(201).json({ department });
    } catch (error) {
      if (isUniqueViolation(error)) {
        next(new ConflictError('Department with this name or code already exists'));
      } else {
        next(error);
      }
    }
  }
);

router.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const department = await prisma.department.findUnique({
        where: { id: req.params.id },
        include: {
          academicYears: { orderBy: { year: 'asc' } },
          batches: { orderBy: { name: 'asc' } },
          _count: { select: { users: true, students: true, sessions: true } },
        },
      });

      if (!department) {
        throw new NotFoundError('Department not found');
      }

      res.json({ department });
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  '/:id',
  authenticateToken,
  requirePermission('departments.update'),
  validate(updateDepartmentSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, code, isActive } = req.body;

      const department = await prisma.department.findUnique({
        where: { id: req.params.id },
      });
      if (!department) {
        throw new NotFoundError('Department not found');
      }

      if (name !== undefined && name !== department.name) {
        const existing = await prisma.department.findUnique({ where: { name } });
        if (existing) {
          throw new ConflictError('Department with this name already exists');
        }
      }

      if (code !== undefined && code !== department.code) {
        if (code) {
          const existing = await prisma.department.findUnique({ where: { code } });
          if (existing) {
            throw new ConflictError('Department with this code already exists');
          }
        }
      }

      const updated = await prisma.department.update({
        where: { id: department.id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(code !== undefined ? { code: code || null } : {}),
          ...(isActive !== undefined ? { isActive } : {}),
        },
      });

      await createAuditLog(prisma, {
        userId: req.user!.id,
        action: 'UPDATE',
        entity: 'DEPARTMENT',
        entityId: department.id,
        oldValue: { name: department.name, code: department.code },
        newValue: { name: updated.name, code: updated.code },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.json({ department: updated });
    } catch (error) {
      if (isUniqueViolation(error)) {
        next(new ConflictError('Department with this name or code already exists'));
      } else {
        next(error);
      }
    }
  }
);

export default router;
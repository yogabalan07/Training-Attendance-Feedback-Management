import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { NotFoundError, ConflictError } from '../lib/errors';
import { createAuditLog } from '../lib/audit';
import { authenticateToken } from '../middleware/auth';
import {
  requirePermission,
  requireScope,
} from '../middleware/authorize';
import { validate } from '../middleware/validate';

const router = Router();

const createBatchSchema = z.object({
  name: z.string().min(1, 'Batch name is required'),
  departmentId: z.string().min(1, 'departmentId is required'),
  academicYearId: z.string().min(1, 'academicYearId is required'),
});

const updateBatchSchema = createBatchSchema.partial().extend({
  isActive: z.boolean().optional(),
});

router.get(
  '/',
  authenticateToken,
  requireScope(),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const departmentId = req.query.departmentId as string | undefined;
      const academicYearId = req.query.academicYearId as string | undefined;
      const departmentScope = (req as any).departmentScope as string | undefined;
      const batchScope = (req as any).batchScope as string | undefined;

      const where: Prisma.BatchWhereInput = {};
      if (departmentId) where.departmentId = departmentId;
      if (academicYearId) where.academicYearId = academicYearId;
      if (departmentScope) where.department = { name: departmentScope };
      if (batchScope) where.id = batchScope;

      const batches = await prisma.batch.findMany({
        where,
        orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
        include: {
          department: true,
          academicYear: true,
          _count: {
            select: { users: true, students: true, sessionBatches: true },
          },
        },
      });

      res.json({ batches });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/',
  authenticateToken,
  requirePermission('batches.create'),
  validate(createBatchSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, departmentId, academicYearId } = req.body;

      const department = await prisma.department.findUnique({
        where: { id: departmentId },
      });
      if (!department) {
        throw new NotFoundError('Department not found');
      }

      const academicYear = await prisma.academicYear.findUnique({
        where: { id: academicYearId },
      });
      if (!academicYear) {
        throw new NotFoundError('Academic year not found');
      }

      if (academicYear.departmentId !== departmentId) {
        throw new NotFoundError(
          'Academic year does not belong to this department'
        );
      }

      const existing = await prisma.batch.findFirst({
        where: { name, departmentId, academicYearId },
      });
      if (existing) {
        throw new ConflictError(
          'Batch with this name already exists in this department and academic year'
        );
      }

      const batch = await prisma.batch.create({
        data: { name, departmentId, academicYearId },
        include: {
          department: true,
          academicYear: true,
        },
      });

      await createAuditLog(prisma, {
        userId: req.user!.id,
        action: 'CREATE',
        entity: 'BATCH',
        entityId: batch.id,
        newValue: { name: batch.name, departmentId, academicYearId },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.status(201).json({ batch });
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  '/:id',
  authenticateToken,
  requirePermission('batches.update'),
  validate(updateBatchSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, departmentId, academicYearId, isActive } = req.body;

      const batch = await prisma.batch.findUnique({
        where: { id: req.params.id },
        include: { academicYear: true },
      });
      if (!batch) {
        throw new NotFoundError('Batch not found');
      }

      if (departmentId) {
        const department = await prisma.department.findUnique({
          where: { id: departmentId },
        });
        if (!department) {
          throw new NotFoundError('Department not found');
        }
      }

      if (academicYearId) {
        const academicYear = await prisma.academicYear.findUnique({
          where: { id: academicYearId },
        });
        if (!academicYear) {
          throw new NotFoundError('Academic year not found');
        }

        const nextDepartmentId = departmentId ?? batch.departmentId;
        if (academicYear.departmentId !== nextDepartmentId) {
          throw new NotFoundError(
            'Academic year does not belong to this department'
          );
        }
      }

      const nextDepartmentId = departmentId ?? batch.departmentId;
      const nextAcademicYearId = academicYearId ?? batch.academicYearId;

      if (
        name !== undefined &&
        (name !== batch.name ||
          nextDepartmentId !== batch.departmentId ||
          nextAcademicYearId !== batch.academicYearId)
      ) {
        const existing = await prisma.batch.findFirst({
          where: {
            name,
            departmentId: nextDepartmentId,
            academicYearId: nextAcademicYearId,
          },
        });
        if (existing) {
          throw new ConflictError(
            'Batch with this name already exists in this department and academic year'
          );
        }
      }

      const updated = await prisma.batch.update({
        where: { id: batch.id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(departmentId !== undefined ? { departmentId } : {}),
          ...(academicYearId !== undefined ? { academicYearId } : {}),
          ...(isActive !== undefined ? { isActive } : {}),
        },
        include: {
          department: true,
          academicYear: true,
        },
      });

      await createAuditLog(prisma, {
        userId: req.user!.id,
        action: 'UPDATE',
        entity: 'BATCH',
        entityId: batch.id,
        oldValue: {
          name: batch.name,
          departmentId: batch.departmentId,
          academicYearId: batch.academicYearId,
        },
        newValue: {
          name: updated.name,
          departmentId: updated.departmentId,
          academicYearId: updated.academicYearId,
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.json({ batch: updated });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
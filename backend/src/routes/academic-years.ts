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

const createAcademicYearSchema = z.object({
  year: z.coerce
    .number()
    .int('Year must be an integer')
    .min(1, 'Year must be at least 1'),
  label: z.string().optional(),
  departmentId: z.string().min(1, 'departmentId is required'),
});

const updateAcademicYearSchema = createAcademicYearSchema.partial().extend({
  isActive: z.boolean().optional(),
});

router.get(
  '/',
  authenticateToken,
  requireScope(),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const departmentId = req.query.departmentId as string | undefined;
      const departmentScope = (req as any).departmentScope as string | undefined;

      const where: Prisma.AcademicYearWhereInput = {};
      if (departmentId) where.departmentId = departmentId;
      if (departmentScope) where.department = { name: departmentScope };

      const academicYears = await prisma.academicYear.findMany({
        where,
        orderBy: [{ year: 'asc' }, { createdAt: 'asc' }],
        include: {
          department: true,
          _count: { select: { batches: true, users: true, students: true } },
        },
      });

      res.json({ academicYears });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/',
  authenticateToken,
  requirePermission('years.create'),
  validate(createAcademicYearSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { year, label, departmentId } = req.body;

      const department = await prisma.department.findUnique({
        where: { id: departmentId },
      });
      if (!department) {
        throw new NotFoundError('Department not found');
      }

      const existing = await prisma.academicYear.findFirst({
        where: { year, departmentId },
      });
      if (existing) {
        throw new ConflictError(
          'Academic year already exists for this department'
        );
      }

      const academicYear = await prisma.academicYear.create({
        data: { year, label: label ?? null, departmentId },
        include: { department: true },
      });

      await createAuditLog(prisma, {
        userId: req.user!.id,
        action: 'CREATE',
        entity: 'ACADEMIC_YEAR',
        entityId: academicYear.id,
        newValue: {
          year: academicYear.year,
          label: academicYear.label,
          departmentId,
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.status(201).json({ academicYear });
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  '/:id',
  authenticateToken,
  requirePermission('years.update'),
  validate(updateAcademicYearSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { year, label, departmentId, isActive } = req.body;

      const academicYear = await prisma.academicYear.findUnique({
        where: { id: req.params.id },
      });
      if (!academicYear) {
        throw new NotFoundError('Academic year not found');
      }

      const nextDepartmentId = departmentId ?? academicYear.departmentId;

      if (departmentId) {
        const department = await prisma.department.findUnique({
          where: { id: departmentId },
        });
        if (!department) {
          throw new NotFoundError('Department not found');
        }
      }

      if (year !== undefined && year !== academicYear.year) {
        const existing = await prisma.academicYear.findFirst({
          where: { year, departmentId: nextDepartmentId },
        });
        if (existing) {
          throw new ConflictError(
            'Academic year already exists for this department'
          );
        }
      }

      if (
        departmentId !== undefined &&
        departmentId !== academicYear.departmentId
      ) {
        const existing = await prisma.academicYear.findFirst({
          where: { year: academicYear.year, departmentId },
        });
        if (existing) {
          throw new ConflictError(
            'Academic year already exists for this department'
          );
        }
      }

      const updated = await prisma.academicYear.update({
        where: { id: academicYear.id },
        data: {
          ...(year !== undefined ? { year } : {}),
          ...(label !== undefined ? { label } : {}),
          ...(departmentId !== undefined ? { departmentId } : {}),
          ...(isActive !== undefined ? { isActive } : {}),
        },
        include: { department: true },
      });

      await createAuditLog(prisma, {
        userId: req.user!.id,
        action: 'UPDATE',
        entity: 'ACADEMIC_YEAR',
        entityId: academicYear.id,
        oldValue: {
          year: academicYear.year,
          label: academicYear.label,
          departmentId: academicYear.departmentId,
        },
        newValue: {
          year: updated.year,
          label: updated.label,
          departmentId: updated.departmentId,
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.json({ academicYear: updated });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
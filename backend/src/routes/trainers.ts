import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { NotFoundError, ConflictError, ValidationError } from '../lib/errors';
import { createAuditLog } from '../lib/audit';
import { authenticateToken } from '../middleware/auth';
import { requirePermission } from '../middleware/authorize';

const router = Router();

const createTrainerSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  type: z.enum(['INTERNAL', 'EXTERNAL'], { errorMap: () => ({ message: 'Type must be INTERNAL or EXTERNAL' }) }),
  specialization: z.string().optional().nullable(),
});

const updateTrainerSchema = z.object({
  type: z.enum(['INTERNAL', 'EXTERNAL']).optional(),
  specialization: z.string().optional().nullable(),
});

function buildScopeFilter(user: { scopeType?: string | null; scopeValue?: string | null }) {
  if (!user.scopeType || user.scopeType === 'ALL') return {};
  if (user.scopeType === 'DEPARTMENT') return { user: { departmentId: user.scopeValue! } };
  if (user.scopeType === 'BATCH') return { user: { batchId: user.scopeValue! } };
  return {};
}

// GET /
router.get(
  '/',
  authenticateToken,
  requirePermission('trainers.view'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { type } = req.query;

      const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
      if (!user) throw new NotFoundError('User not found');

      const scopeFilter = buildScopeFilter(user);

      const where: Record<string, unknown> = {
        ...scopeFilter,
        ...(type ? { type: type as string } : {}),
      };

      const trainers = await prisma.trainer.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              loginId: true,
              name: true,
              role: true,
              departmentId: true,
              academicYearId: true,
              batchId: true,
              isActive: true,
            },
          },
          _count: {
            select: { assignments: true, sessions: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      res.json({ trainers, total: trainers.length });
    } catch (error) {
      next(error);
    }
  }
);

// POST /
router.post(
  '/',
  authenticateToken,
  requirePermission('trainers.create'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = createTrainerSchema.safeParse(req.body);
      if (!parsed.success) {
        const errors: Record<string, string[]> = {};
        parsed.error.issues.forEach((issue) => {
          const key = issue.path.join('.');
          if (!errors[key]) errors[key] = [];
          errors[key].push(issue.message);
        });
        throw new ValidationError('Validation failed', errors);
      }

      const { userId, type, specialization } = parsed.data;

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundError('User not found');

      const existingTrainer = await prisma.trainer.findUnique({ where: { userId } });
      if (existingTrainer) throw new ConflictError('This user already has a trainer profile');

      const trainer = await prisma.trainer.create({
        data: {
          userId,
          type,
          specialization: specialization ?? null,
        },
        include: {
          user: {
            select: {
              id: true,
              loginId: true,
              name: true,
              role: true,
              departmentId: true,
              academicYearId: true,
              batchId: true,
              isActive: true,
            },
          },
        },
      });

      await createAuditLog(prisma, {
        userId: req.user!.id,
        action: 'CREATE',
        entity: 'TRAINER',
        entityId: trainer.id,
        newValue: { userId, type, specialization },
      });

      res.status(201).json(trainer);
    } catch (error) {
      next(error);
    }
  }
);

// GET /:id
router.get(
  '/:id',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);

      const trainer = await prisma.trainer.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              loginId: true,
              name: true,
              role: true,
              departmentId: true,
              academicYearId: true,
              batchId: true,
              isActive: true,
            },
          },
          assignments: {
            include: {
              batch: {
                include: {
                  department: true,
                  academicYear: true,
                },
              },
              session: true,
            },
            orderBy: { createdAt: 'desc' },
          },
          sessions: {
            include: {
              department: true,
              academicYear: true,
              sessionBatches: { include: { batch: true } },
            },
            orderBy: { date: 'desc' },
          },
        },
      });

      if (!trainer) throw new NotFoundError('Trainer not found');

      res.json(trainer);
    } catch (error) {
      next(error);
    }
  }
);

// PATCH /:id
router.patch(
  '/:id',
  authenticateToken,
  requirePermission('trainers.update'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);

      const existing = await prisma.trainer.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError('Trainer not found');

      const parsed = updateTrainerSchema.safeParse(req.body);
      if (!parsed.success) {
        const errors: Record<string, string[]> = {};
        parsed.error.issues.forEach((issue) => {
          const key = issue.path.join('.');
          if (!errors[key]) errors[key] = [];
          errors[key].push(issue.message);
        });
        throw new ValidationError('Validation failed', errors);
      }

      const trainer = await prisma.trainer.update({
        where: { id },
        data: parsed.data,
        include: {
          user: {
            select: {
              id: true,
              loginId: true,
              name: true,
              role: true,
              departmentId: true,
              academicYearId: true,
              batchId: true,
              isActive: true,
            },
          },
        },
      });

      await createAuditLog(prisma, {
        userId: req.user!.id,
        action: 'UPDATE',
        entity: 'TRAINER',
        entityId: id,
        oldValue: { type: existing.type, specialization: existing.specialization },
        newValue: parsed.data,
      });

      res.json(trainer);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
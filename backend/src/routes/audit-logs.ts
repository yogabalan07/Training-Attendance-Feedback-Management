import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { authenticateToken } from '../middleware/auth';
import { requirePermission } from '../middleware/authorize';

const router = Router();

router.get(
  '/',
  authenticateToken,
  requirePermission('audit_logs.view'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Math.max(parseInt(String(req.query.page), 10) || 1, 1);
      const limit = Math.min(
        Math.max(parseInt(String(req.query.limit), 10) || 20, 1),
        100
      );

      const userId = req.query.userId as string | undefined;
      const entity = req.query.entity as string | undefined;
      const action = req.query.action as string | undefined;
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;

      const where: Prisma.AuditLogWhereInput = {};

      if (userId) where.userId = userId;
      if (entity) where.entity = entity;
      if (action) where.action = action;

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) {
          where.createdAt.gte = new Date(startDate);
        }
        if (endDate) {
          where.createdAt.lte = new Date(endDate);
        }
      }

      const [logs, total] = await prisma.$transaction([
        prisma.auditLog.findMany({
          where,
          include: {
            user: {
              select: {
                id: true,
                name: true,
                loginId: true,
                role: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.auditLog.count({ where }),
      ]);

      res.json({ logs, total, page, limit });
    } catch (error) {
      next(error);
    }
  }
);

export default router;

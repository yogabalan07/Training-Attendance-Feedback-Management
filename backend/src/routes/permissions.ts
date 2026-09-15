import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import {
  NotFoundError,
  ValidationError,
} from '../lib/errors';
import { createAuditLog } from '../lib/audit';
import { authenticateToken } from '../middleware/auth';
import { requirePermission } from '../middleware/authorize';
import { validate } from '../middleware/validate';

const router = Router();

const updateRolePermissionsSchema = z.object({
  permissionIds: z.array(z.string().min(1, 'permissionId is required')),
});

router.get(
  '/',
  authenticateToken,
  requirePermission('permissions.view'),
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const permissions = await prisma.permission.findMany({
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
      });

      const grouped = permissions.reduce<Record<string, typeof permissions>>(
        (acc, permission) => {
          if (!acc[permission.category]) {
            acc[permission.category] = [];
          }
          acc[permission.category].push(permission);
          return acc;
        },
        {}
      );

      res.json({ permissions: grouped, count: permissions.length });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/roles',
  authenticateToken,
  requirePermission('permissions.view'),
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const roles = await prisma.role.findMany({
        orderBy: { name: 'asc' },
        include: {
          permissions: {
            include: { permission: true },
            orderBy: { permission: { name: 'asc' } },
          },
          roleDefaultPermissions: {
            include: { permission: true },
            orderBy: { permission: { name: 'asc' } },
          },
          _count: { select: { users: true } },
        },
      });

      res.json({
        roles: roles.map((role) => ({
          ...role,
          permissions: role.permissions.map((rp) => rp.permission),
          defaultPermissions: role.roleDefaultPermissions.map(
            (rp) => rp.permission
          ),
        })),
      });
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  '/roles/:roleId',
  authenticateToken,
  requirePermission('permissions.manage'),
  validate(updateRolePermissionsSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { permissionIds } = req.body as { permissionIds: string[] };

      const role = await prisma.role.findUnique({
        where: { id: req.params.roleId },
      });
      if (!role) {
        throw new NotFoundError('Role not found');
      }

      const uniqueIds = Array.from(new Set(permissionIds));
      if (uniqueIds.length > 0) {
        const found = await prisma.permission.findMany({
          where: { id: { in: uniqueIds } },
          select: { id: true },
        });
        if (found.length !== uniqueIds.length) {
          throw new ValidationError('One or more permissions do not exist', {
            permissionIds: ['permissionId must reference an existing permission'],
          });
        }
      }

      await prisma.$transaction([
        prisma.rolePermission.deleteMany({
          where: { roleId: role.id },
        }),
        ...uniqueIds.map((permissionId) =>
          prisma.rolePermission.create({
            data: { roleId: role.id, permissionId },
          })
        ),
      ]);

      await createAuditLog(prisma, {
        userId: req.user!.id,
        action: 'UPDATE_ROLE_PERMISSIONS',
        entity: 'ROLE',
        entityId: role.id,
        newValue: { permissionIds: uniqueIds },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      const updated = await prisma.role.findUnique({
        where: { id: role.id },
        include: {
          permissions: {
            include: { permission: true },
            orderBy: { permission: { name: 'asc' } },
          },
        },
      });

      res.json({
        role: {
          ...updated,
          permissions: updated!.permissions.map((rp) => rp.permission),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
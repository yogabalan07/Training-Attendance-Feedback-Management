import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { hashPassword } from '../lib/auth';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
} from '../lib/errors';
import { createAuditLog } from '../lib/audit';
import { authenticateToken } from '../middleware/auth';
import { requirePermission } from '../middleware/authorize';
import { validate } from '../middleware/validate';

const router = Router();

const USER_ROLES = [
  'ADMIN',
  'INTERNAL_TRAINER',
  'EXTERNAL_TRAINER',
  'STUDENT',
  'CUSTOM_STAFF',
] as const;

const createUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  loginId: z.string().min(1, 'Login ID is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(USER_ROLES),
  departmentId: z.string().optional(),
  academicYearId: z.string().optional(),
  batchId: z.string().optional(),
  scopeType: z.enum(['ALL', 'DEPARTMENT', 'BATCH']).optional(),
  scopeValue: z.string().optional(),
});

const updateUserSchema = createUserSchema.partial();

const setDirectPermissionsSchema = z.object({
  permissions: z
    .array(
      z.object({
        permissionId: z.string().min(1, 'permissionId is required'),
        granted: z.boolean(),
      })
    )
    .min(1, 'At least one permission must be provided'),
});

function stripPasswordHash<T extends { passwordHash: string }>(
  user: T
): Omit<T, 'passwordHash'> {
  const { passwordHash, ...safeUser } = user;
  void passwordHash;
  return safeUser;
}

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
  authenticateToken,
  requirePermission('users.view'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Math.max(parseInt(String(req.query.page), 10) || 1, 1);
      const limit = Math.min(
        Math.max(parseInt(String(req.query.limit), 10) || 10, 1),
        100
      );
      const search = req.query.search as string | undefined;
      const role = req.query.role as string | undefined;
      const departmentId = req.query.departmentId as string | undefined;

      const where: Prisma.UserWhereInput = {};
      if (search) {
        where.OR = [
          { name: { contains: search } },
          { loginId: { contains: search } },
        ];
      }
      if (role) where.role = role;
      if (departmentId) where.departmentId = departmentId;

      const [users, total] = await prisma.$transaction([
        prisma.user.findMany({
          where,
          include: {
            department: true,
            academicYear: true,
            batch: true,
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.user.count({ where }),
      ]);

      res.json({
        users: users.map(stripPasswordHash),
        total,
        page,
        limit,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/',
  authenticateToken,
  requirePermission('users.create'),
  validate(createUserSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, loginId, password, role, departmentId, academicYearId, batchId, scopeType, scopeValue } = req.body;

      const existing = await prisma.user.findUnique({ where: { loginId } });
      if (existing) {
        throw new ConflictError('A user with this login ID already exists');
      }

      const roleExists = await prisma.role.findUnique({ where: { name: role } });
      if (!roleExists) {
        throw new ValidationError('Invalid role', { role: ['Role does not exist'] });
      }

      const passwordHash = await hashPassword(password);

      const user = await prisma.user.create({
        data: {
          name,
          loginId,
          passwordHash,
          role,
          departmentId: departmentId ?? null,
          academicYearId: academicYearId ?? null,
          batchId: batchId ?? null,
          scopeType: scopeType ?? null,
          scopeValue: scopeValue ?? null,
        },
        include: {
          department: true,
          academicYear: true,
          batch: true,
        },
      });

      await createAuditLog(prisma, {
        userId: req.user!.id,
        action: 'CREATE',
        entity: 'USER',
        entityId: user.id,
        newValue: { name: user.name, loginId: user.loginId, role: user.role },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.status(201).json({ user: stripPasswordHash(user) });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/:id',
  authenticateToken,
  requirePermission('users.view'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.params.id },
        include: {
          department: true,
          academicYear: true,
          batch: true,
          studentProfile: true,
          trainerProfile: true,
        },
      });

      if (!user) {
        throw new NotFoundError('User not found');
      }

      res.json({ user: stripPasswordHash(user) });
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  '/:id',
  authenticateToken,
  requirePermission('users.update'),
  validate(updateUserSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { password, role, loginId, ...rest } = req.body;

      const user = await prisma.user.findUnique({
        where: { id: req.params.id },
      });
      if (!user) {
        throw new NotFoundError('User not found');
      }

      const data: Prisma.UserUncheckedUpdateInput = { ...rest };

      if (loginId !== undefined) {
        const existing = await prisma.user.findUnique({ where: { loginId } });
        if (existing && existing.id !== user.id) {
          throw new ConflictError('A user with this login ID already exists');
        }
        data.loginId = loginId;
      }

      if (role !== undefined) {
        const roleExists = await prisma.role.findUnique({ where: { name: role } });
        if (!roleExists) {
          throw new ValidationError('Invalid role', { role: ['Role does not exist'] });
        }
        data.role = role;
      }

      if (password !== undefined) {
        data.passwordHash = await hashPassword(password);
      }

      const updated = await prisma.user.update({
        where: { id: user.id },
        data,
        include: {
          department: true,
          academicYear: true,
          batch: true,
        },
      });

      await createAuditLog(prisma, {
        userId: req.user!.id,
        action: 'UPDATE',
        entity: 'USER',
        entityId: user.id,
        oldValue: stripPasswordHash(user),
        newValue: stripPasswordHash(updated),
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.json({ user: stripPasswordHash(updated) });
    } catch (error) {
      if (isUniqueViolation(error)) {
        next(new ConflictError('A user with this login ID already exists'));
      } else {
        next(error);
      }
    }
  }
);

router.patch(
  '/:id/toggle-status',
  authenticateToken,
  requirePermission('users.disable'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.params.id },
      });
      if (!user) {
        throw new NotFoundError('User not found');
      }

      const updated = await prisma.user.update({
        where: { id: user.id },
        data: { isActive: !user.isActive },
        include: {
          department: true,
          academicYear: true,
          batch: true,
        },
      });

      await createAuditLog(prisma, {
        userId: req.user!.id,
        action: user.isActive ? 'DISABLE' : 'ENABLE',
        entity: 'USER',
        entityId: user.id,
        oldValue: { isActive: user.isActive },
        newValue: { isActive: updated.isActive },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.json({ user: stripPasswordHash(updated) });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/:id/permissions',
  authenticateToken,
  requirePermission('permissions.view'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.params.id },
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

      if (!user) {
        throw new NotFoundError('User not found');
      }

      const rolePermissions = user.roleRelation
        ? user.roleRelation.permissions.map((rp) => rp.permission)
        : [];

      const directPermissions = user.userPermissions.map((up) => ({
        permissionId: up.permissionId,
        granted: up.granted,
        permission: up.permission,
      }));

      const directNames = new Set(
        directPermissions.filter((dp) => dp.granted).map((dp) => dp.permission.name)
      );
      const combinedNames = new Set([
        ...rolePermissions.map((p) => p.name),
        ...directNames,
      ]);

      res.json({
        rolePermissions,
        directPermissions,
        allPermissions: Array.from(combinedNames),
      });
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  '/:id/permissions',
  authenticateToken,
  requirePermission('permissions.manage'),
  validate(setDirectPermissionsSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { permissions } = req.body as {
        permissions: { permissionId: string; granted: boolean }[];
      };

      const user = await prisma.user.findUnique({
        where: { id: req.params.id },
      });
      if (!user) {
        throw new NotFoundError('User not found');
      }

      const uniqueIds = Array.from(
        new Set(permissions.map((p) => p.permissionId))
      );
      const found = await prisma.permission.findMany({
        where: { id: { in: uniqueIds } },
        select: { id: true },
      });
      if (found.length !== uniqueIds.length) {
        throw new ValidationError('One or more permissions do not exist', {
          permissions: ['permissionId must reference an existing permission'],
        });
      }

      await prisma.$transaction(
        permissions.map((p) =>
          prisma.userPermission.upsert({
            where: {
              userId_permissionId: {
                userId: user.id,
                permissionId: p.permissionId,
              },
            },
            update: { granted: p.granted },
            create: {
              userId: user.id,
              permissionId: p.permissionId,
              granted: p.granted,
            },
          })
        )
      );

      await createAuditLog(prisma, {
        userId: req.user!.id,
        action: 'UPDATE_PERMISSIONS',
        entity: 'USER',
        entityId: user.id,
        newValue: { permissions },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      const updated = await prisma.userPermission.findMany({
        where: { userId: user.id },
        include: { permission: true },
        orderBy: { createdAt: 'asc' },
      });

      res.json({
        permissions: updated.map((up) => ({
          permissionId: up.permissionId,
          granted: up.granted,
          permission: up.permission,
        })),
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
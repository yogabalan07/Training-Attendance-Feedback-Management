import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { ForbiddenError } from '../lib/errors';

export function requirePermission(permissionName: string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ForbiddenError('Authentication required');
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
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

      if (!user || !user.isActive) {
        throw new ForbiddenError('User not found or inactive');
      }

      const rolePermissions = user.roleRelation?.permissions.map(
        (rp) => rp.permission.name
      ) || [];
      const directPermissions = user.userPermissions
        .filter((up) => up.granted)
        .map((up) => up.permission.name);
      const allPermissions = new Set([...rolePermissions, ...directPermissions]);

      if (!allPermissions.has(permissionName)) {
        throw new ForbiddenError(`Missing required permission: ${permissionName}`);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw new ForbiddenError('Authentication required');
      }

      if (!roles.includes(req.user.role)) {
        throw new ForbiddenError(`Required role: ${roles.join(' or ')}`);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireScope(
  resourceDepartmentIdFn?: (req: Request) => string | undefined,
  resourceBatchIdFn?: (req: Request) => string | undefined
) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ForbiddenError('Authentication required');
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
      });

      if (!user) {
        throw new ForbiddenError('User not found');
      }

      if (user.scopeType === 'ALL' || !user.scopeType) {
        next();
        return;
      }

      if (user.scopeType === 'DEPARTMENT') {
        const resourceDeptId = resourceDepartmentIdFn?.(req);
        if (resourceDeptId && user.scopeValue !== resourceDeptId) {
          throw new ForbiddenError('Access denied: department scope mismatch');
        }
      }

      if (user.scopeType === 'BATCH') {
        const resourceBatchId = resourceBatchIdFn?.(req);
        if (resourceBatchId && user.scopeValue !== resourceBatchId) {
          throw new ForbiddenError('Access denied: batch scope mismatch');
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { generateToken, comparePassword, hashPassword } from '../lib/auth';
import {
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
} from '../lib/errors';
import { createAuditLog } from '../lib/audit';
import { authenticateToken } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

const loginSchema = z.object({
  loginId: z.string().min(1, 'Login ID is required'),
  password: z.string().min(1, 'Password is required'),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
});

router.post(
  '/login',
  validate(loginSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { loginId, password } = req.body;

      const user = await prisma.user.findUnique({ where: { loginId } });
      if (!user) {
        throw new UnauthorizedError('Invalid login ID or password');
      }

      if (!user.isActive) {
        throw new ForbiddenError('Account is disabled. Contact administrator');
      }

      const passwordValid = await comparePassword(password, user.passwordHash);
      if (!passwordValid) {
        throw new UnauthorizedError('Invalid login ID or password');
      }

      const token = generateToken({ userId: user.id, role: user.role });

      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      await createAuditLog(prisma, {
        userId: user.id,
        action: 'LOGIN',
        entity: 'USER',
        entityId: user.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.json({
        success: true,
        data: {
          token,
          user: {
            id: user.id,
            name: user.name,
            role: user.role,
            loginId: user.loginId,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/logout',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;

      await createAuditLog(prisma, {
        userId,
        action: 'LOGOUT',
        entity: 'USER',
        entityId: userId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  '/me',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
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

      const { passwordHash: _passwordHash, ...safeUser } = user;
      res.json({ success: true, data: safeUser });
    } catch (error) {
      next(error);
    }
  }
);

router.put(
  '/change-password',
  authenticateToken,
  validate(changePasswordSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { currentPassword, newPassword } = req.body;

      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
      });
      if (!user) {
        throw new NotFoundError('User not found');
      }

      const passwordValid = await comparePassword(
        currentPassword,
        user.passwordHash
      );
      if (!passwordValid) {
        throw new UnauthorizedError('Current password is incorrect');
      }

      const passwordHash = await hashPassword(newPassword);
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      });

      await createAuditLog(prisma, {
        userId: user.id,
        action: 'CHANGE_PASSWORD',
        entity: 'USER',
        entityId: user.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
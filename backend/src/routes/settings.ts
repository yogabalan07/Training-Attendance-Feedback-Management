import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { ValidationError } from '../lib/errors';
import { createAuditLog } from '../lib/audit';
import { authenticateToken } from '../middleware/auth';
import { requirePermission } from '../middleware/authorize';
import { validate } from '../middleware/validate';

const router = Router();

const DEFAULT_SETTINGS: Record<string, { value: string; category: string }> = {
  'attendance.min_percentage': { value: '75', category: 'ATTENDANCE' },
  'attendance.od_in_denominator': { value: 'false', category: 'ATTENDANCE' },
  'attendance.pending_in_denominator': { value: 'false', category: 'ATTENDANCE' },
  'attendance.pending_warning_days': { value: '2', category: 'ATTENDANCE' },
  'feedback.min_questions': { value: '1', category: 'FEEDBACK' },
};

const updateSettingsSchema = z.object({
  settings: z
    .array(
      z.object({
        key: z.string().min(1, 'Setting key is required'),
        value: z.string().min(1, 'Setting value is required'),
      })
    )
    .min(1, 'At least one setting must be provided'),
});

async function ensureDefaults(): Promise<void> {
  const existing = await prisma.systemSetting.findMany({
    select: { key: true },
  });
  const existingKeys = new Set(existing.map((s) => s.key));

  const toCreate = Object.entries(DEFAULT_SETTINGS).filter(
    ([key]) => !existingKeys.has(key)
  );

  if (toCreate.length > 0) {
    await prisma.systemSetting.createMany({
      data: toCreate.map(([key, { value, category }]) => ({
        key,
        value,
        category,
      })),
    });
  }
}

async function getSettingsMap(): Promise<Record<string, string>> {
  await ensureDefaults();
  const settings = await prisma.systemSetting.findMany();
  const map: Record<string, string> = {};
  for (const s of settings) {
    map[s.key] = s.value;
  }
  return map;
}

router.get(
  '/',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const settings = await getSettingsMap();
      res.json({ settings });
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  '/',
  authenticateToken,
  requirePermission('system_settings.manage'),
  validate(updateSettingsSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { settings } = req.body as {
        settings: { key: string; value: string }[];
      };

      const validKeys = Object.keys(DEFAULT_SETTINGS);
      const invalidKeys = settings.filter((s) => !validKeys.includes(s.key));
      if (invalidKeys.length > 0) {
        throw new ValidationError('Invalid setting keys', {
          settings: [`Unknown keys: ${invalidKeys.map((k) => k.key).join(', ')}`],
        });
      }

      const previousSettings = await getSettingsMap();

      await prisma.$transaction(
        settings.map((s) =>
          prisma.systemSetting.upsert({
            where: { key: s.key },
            update: { value: s.value },
            create: {
              key: s.key,
              value: s.value,
              category: DEFAULT_SETTINGS[s.key].category,
            },
          })
        )
      );

      await createAuditLog(prisma, {
        userId: req.user!.id,
        action: 'UPDATE',
        entity: 'SYSTEM_SETTING',
        oldValue: Object.fromEntries(
          settings.map((s) => [s.key, previousSettings[s.key]])
        ),
        newValue: Object.fromEntries(
          settings.map((s) => [s.key, s.value])
        ),
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      const updatedSettings = await getSettingsMap();
      res.json({ settings: updatedSettings });
    } catch (error) {
      next(error);
    }
  }
);

export default router;

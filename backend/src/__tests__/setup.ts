import { beforeAll, afterAll } from 'vitest';
import prisma from '../lib/prisma';

let dbAvailable = true;
let reason = '';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function checkDbWithRetry(attempts = 3): Promise<boolean> {
  for (let i = 1; i <= attempts; i++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (e) {
      if (i === attempts) return false;
      await sleep(1000 * i);
      void e;
    }
  }
  return false;
}

beforeAll(async () => {
  const reachable = await checkDbWithRetry();
  if (!reachable) {
    dbAvailable = false;
    reason =
      'DATABASE_URL is not set or unreachable. Set DATABASE_URL in backend/.env to a seeded PostgreSQL database.';
    console.warn(`\n⚠  ${reason}\n`);
    return;
  }

  try {
    await prisma.user.findUnique({ where: { loginId: 'admin' } });
  } catch {
    dbAvailable = false;
    reason =
      'Database is reachable but the schema is missing or incomplete. ' +
      'Run `npx prisma migrate dev` then `npm run seed` in backend/ before running integration tests.';
    console.warn(`\n⚠  ${reason}\n`);
    return;
  }

  const admin = await prisma.user.findUnique({ where: { loginId: 'admin' } });
  if (!admin) {
    dbAvailable = false;
    reason =
      'Database is reachable but does not contain the seed data. ' +
      'Run `npm run seed` in backend/ before running integration tests.';
    console.warn(`\n⚠  ${reason}\n`);
  }
});

afterAll(async () => {
  await prisma.$disconnect().catch(() => undefined);
});

export function isDbAvailable(): boolean {
  return dbAvailable;
}

export function dbReason(): string {
  return reason;
}

export { prisma };
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const users = await p.user.findMany({
    where: { loginId: { in: ['admin', 'internal1', '2023cse001@student'] } },
    select: { loginId: true, isActive: true, role: true, passwordHash: true },
  });
  for (const u of users) {
    console.log(
      `${u.loginId} | active=${u.isActive} | role=${u.role} | hashStarts=${(u.passwordHash || '').slice(0, 7)} | hashLen=${(u.passwordHash || '').length}`
    );
  }
  const { default: bcrypt } = await import('bcryptjs');
  for (const u of users) {
    const cred = u.loginId === 'admin' ? 'admin123' : 'trainer123';
    const ok = await bcrypt.compare(cred, u.passwordHash || '');
    console.log(`${cred} matches ${u.loginId}:`, ok);
  }
  await p.$disconnect();
})();
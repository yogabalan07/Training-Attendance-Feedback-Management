import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app';
import prisma from '../lib/prisma';
import { loginUser, authHeader, requireDb } from './helpers';

describe('Audit logs', () => {
  it('admin GET /api/audit-logs returns logs array and total', async () => {
    requireDb();

    const { token } = await loginUser(app, 'admin', 'admin123');

    const res = await request(app)
      .get('/api/audit-logs')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.logs)).toBe(true);
    expect(typeof res.body.total).toBe('number');
    expect(res.body.total).toBeGreaterThanOrEqual(0);
  });

  it('creating a user generates a CREATE audit log with entity USER', async () => {
    requireDb();

    const { token, user } = await loginUser(app, 'admin', 'admin123');

    const uniqueLoginId = `audit_user_${Date.now()}`;

    const createRes = await request(app)
      .post('/api/users')
      .set(authHeader(token))
      .send({
        name: 'Audit Test User',
        loginId: uniqueLoginId,
        password: 'password123',
        role: 'STUDENT',
      });

    expect(createRes.status).toBe(201);
    const createdUserId: string | undefined = createRes.body.user?.id;
    expect(createdUserId).toBeDefined();

    try {
      const auditRes = await request(app)
        .get(`/api/audit-logs?userId=${user.id}&action=CREATE&entity=USER`)
        .set(authHeader(token));

      expect(auditRes.status).toBe(200);
      expect(auditRes.body.logs.length).toBeGreaterThan(0);

      const match = auditRes.body.logs.find(
        (log: { entityId?: string | null; action: string; entity: string }) =>
          log.action === 'CREATE' && log.entity === 'USER' && log.entityId === createdUserId
      );
      expect(match).toBeDefined();
    } finally {
      if (createdUserId) {
        await prisma.user.delete({ where: { id: createdUserId } }).catch(() => undefined);
      }
    }
  });

  it('non-admin without audit_logs.view permission is denied', async () => {
    requireDb();

    const { token } = await loginUser(app, 'internal1', 'trainer123');

    const res = await request(app)
      .get('/api/audit-logs')
      .set(authHeader(token));

    expect(res.status).toBe(403);
  });
});
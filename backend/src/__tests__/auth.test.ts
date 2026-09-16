import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../app';
import prisma from '../lib/prisma';
import { loginUser, authHeader, requireDb } from './helpers';

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-in-production';

describe('Auth', () => {
  it('POST /api/auth/login succeeds with admin/admin123 and returns token + ADMIN role', async () => {
    requireDb();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ loginId: 'admin', password: 'admin123' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('token');
    expect(res.body.data.user).toBeDefined();
    expect(res.body.data.user.role).toBe('ADMIN');
    expect(res.body.data.user.loginId).toBe('admin');
  });

  it('POST /api/auth/login fails with wrong password → 401', async () => {
    requireDb();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ loginId: 'admin', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/auth/login with unknown user → 401', async () => {
    requireDb();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ loginId: 'nonexistent_user_xyz', password: 'anypassword' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/auth/login with inactive user → 403', async () => {
    requireDb();

    const user = await prisma.user.findUnique({ where: { loginId: 'admin' } });
    if (!user) throw new Error('admin user not found');

    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });

    try {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ loginId: 'admin', password: 'admin123' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    } finally {
      await prisma.user.update({ where: { id: user.id }, data: { isActive: true } });
    }
  });

  it('POST /api/auth/login returns valid JWT that can be decoded', async () => {
    requireDb();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ loginId: 'admin', password: 'admin123' });

    expect(res.status).toBe(200);
    const { token } = res.body.data;

    const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
    expect(decoded).toHaveProperty('userId');
    expect(decoded).toHaveProperty('role', 'ADMIN');
    expect(decoded).toHaveProperty('exp');
  });

  it('GET /api/auth/me with valid token returns user', async () => {
    requireDb();

    const { token } = await loginUser(app, 'admin', 'admin123');

    const res = await request(app)
      .get('/api/auth/me')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.loginId).toBe('admin');
    expect(res.body.data.role).toBe('ADMIN');
    expect(res.body.data).not.toHaveProperty('passwordHash');
  });

  it('GET /api/auth/me without token → 401', async () => {
    requireDb();

    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/auth/me with invalid token → 401', async () => {
    requireDb();

    const res = await request(app)
      .get('/api/auth/me')
      .set(authHeader('this.is.not.a.valid.jwt.token'));

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('student cannot access admin-only /api/users → 403', async () => {
    requireDb();

    const { token } = await loginUser(app, '2023cse001@student', 'student123');

    const res = await request(app)
      .get('/api/users')
      .set(authHeader(token));

    expect(res.status).toBe(403);
  });

  it('login → /me full round-trip works for every seeded role', async () => {
    requireDb();

    const accounts = [
      { loginId: 'admin', password: 'admin123', expectedRole: 'ADMIN' },
      { loginId: 'internal1', password: 'trainer123', expectedRole: 'INTERNAL_TRAINER' },
      { loginId: 'external1', password: 'trainer123', expectedRole: 'EXTERNAL_TRAINER' },
      { loginId: '2023cse001@student', password: 'student123', expectedRole: 'STUDENT' },
    ];

    for (const acct of accounts) {
      const { token, user } = await loginUser(app, acct.loginId, acct.password);
      expect(user.role).toBe(acct.expectedRole);

      const me = await request(app)
        .get('/api/auth/me')
        .set(authHeader(token));

      expect(me.status).toBe(200);
      expect(me.body.success).toBe(true);
      expect(me.body.data.loginId).toBe(acct.loginId);
      expect(me.body.data.role).toBe(acct.expectedRole);
      expect(me.body.data).not.toHaveProperty('passwordHash');
    }
  });
});

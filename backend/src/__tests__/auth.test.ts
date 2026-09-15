import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app';
import prisma from '../lib/prisma';
import { loginUser, authHeader, requireDb } from './helpers';

describe('Auth', () => {
  it('POST /api/auth/login succeeds with admin/admin123 and returns token + ADMIN role', async () => {
    requireDb();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ loginId: 'admin', password: 'admin123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toBeDefined();
    expect(res.body.user.role).toBe('ADMIN');
    expect(res.body.user.loginId).toBe('admin');
  });

  it('POST /api/auth/login fails with wrong password → 401', async () => {
    requireDb();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ loginId: 'admin', password: 'wrongpassword' });

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

  it('GET /api/auth/me with valid token returns user', async () => {
    requireDb();

    const { token } = await loginUser(app, 'admin', 'admin123');

    const res = await request(app)
      .get('/api/auth/me')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.loginId).toBe('admin');
    expect(res.body.user.role).toBe('ADMIN');
    expect(res.body.user).not.toHaveProperty('passwordHash');
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
});

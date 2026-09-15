import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app';
import prisma from '../lib/prisma';
import { loginUser, authHeader, requireDb } from './helpers';

describe('Student access', () => {
  it('student can GET /api/students/:id/attendance for own student id', async () => {
    requireDb();

    const { token, user } = await loginUser(app, '2023cse001@student', 'student123');

    const student = await prisma.student.findFirst({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!student) throw new Error('student profile not found');

    const res = await request(app)
      .get(`/api/students/${student.id}/attendance`)
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('student cannot POST /api/attendance/mark → 403', async () => {
    requireDb();

    const { token } = await loginUser(app, '2023cse001@student', 'student123');

    const session = await prisma.session.findFirst({
      where: { subject: { contains: 'Python' } },
      select: { id: true },
    });
    const student = await prisma.student.findFirst({
      where: { registerNumber: '2023CSE001' },
      select: { id: true },
    });
    if (!session || !student) throw new Error('seed entities not found');

    const res = await request(app)
      .post('/api/attendance/mark')
      .set(authHeader(token))
      .send({
        sessionId: session.id,
        studentId: student.id,
        status: 'PRESENT',
      });

    expect(res.status).toBe(403);
  });

  it('student cannot GET /api/users → 403', async () => {
    requireDb();

    const { token } = await loginUser(app, '2023cse001@student', 'student123');

    const res = await request(app)
      .get('/api/users')
      .set(authHeader(token));

    expect(res.status).toBe(403);
  });
});

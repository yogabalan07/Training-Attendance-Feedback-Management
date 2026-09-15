import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../app';
import prisma from '../lib/prisma';
import { loginUser, authHeader, requireDb } from './helpers';
import { isDbAvailable } from './setup';

describe('Feedback', () => {
  let completedSessionId: string;

  beforeAll(async () => {
    if (!isDbAvailable()) return;

    const session = await prisma.session.findFirst({
      where: { subject: { contains: 'Python' }, sessionType: 'AFTERNOON' },
    });
    if (!session) throw new Error('afternoon Python session not found');

    completedSessionId = session.id;
    await prisma.session.update({
      where: { id: session.id },
      data: { status: 'COMPLETED' },
    });

    await prisma.feedbackResponse.deleteMany({ where: { sessionId: session.id } });
  });

  it('student GET /api/feedback/analytics returns empty analytics or 403 (student lacks feedback.view)', async () => {
    requireDb();

    const { token } = await loginUser(app, '2023cse001@student', 'student123');

    const res = await request(app)
      .get('/api/feedback/analytics')
      .set(authHeader(token));

    if (res.status === 200) {
      expect(res.body.overall.totalResponses).toBe(0);
      expect(res.body.questionWise).toEqual([]);
    } else {
      expect(res.status).toBe(403);
    }
  });

  it('student POST /api/feedback creates feedback → 201', async () => {
    requireDb();

    const { token } = await loginUser(app, '2023cse001@student', 'student123');

    const question = await prisma.feedbackQuestion.findFirst({
      where: { isActive: true },
      select: { id: true },
    });
    if (!question) throw new Error('no feedback question found');

    const res = await request(app)
      .post('/api/feedback')
      .set(authHeader(token))
      .send({
        sessionId: completedSessionId,
        comments: 'Great session',
        answers: [{ questionId: question.id, rating: 4 }],
      });

    expect(res.status).toBe(201);
  });

  it('student duplicate feedback for same session → 409', async () => {
    requireDb();

    const { token } = await loginUser(app, '2023cse001@student', 'student123');

    const question = await prisma.feedbackQuestion.findFirst({
      where: { isActive: true },
      select: { id: true },
    });
    if (!question) throw new Error('no feedback question found');

    const res = await request(app)
      .post('/api/feedback')
      .set(authHeader(token))
      .send({
        sessionId: completedSessionId,
        answers: [{ questionId: question.id, rating: 5 }],
      });

    expect(res.status).toBe(409);
  });

  it('student POST /api/feedback with rating 6 → 400/422 validation error', async () => {
    requireDb();

    const { token } = await loginUser(app, '2023cse001@student', 'student123');

    const question = await prisma.feedbackQuestion.findFirst({
      where: { isActive: true },
      select: { id: true },
    });
    if (!question) throw new Error('no feedback question found');

    const res = await request(app)
      .post('/api/feedback')
      .set(authHeader(token))
      .send({
        sessionId: completedSessionId,
        answers: [{ questionId: question.id, rating: 6 }],
      });

    expect([400, 422]).toContain(res.status);
  });

  it('internal trainer GET /api/feedback is anonymized (no student identity fields)', async () => {
    requireDb();

    const { token } = await loginUser(app, 'internal1', 'trainer123');

    const res = await request(app)
      .get(`/api/feedback?sessionId=${completedSessionId}`)
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);

    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain('studentId');
    expect(raw).not.toContain('registerNumber');
    expect(raw).not.toContain('studentName');
  });
});
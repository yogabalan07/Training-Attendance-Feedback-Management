import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app';
import prisma from '../lib/prisma';
import { loginUser, authHeader, requireDb } from './helpers';

function bodyAsText(res: { text?: string; body: unknown }): string {
  if (typeof res.text === 'string') return res.text;
  if (res.body instanceof Buffer) return res.body.toString('utf-8');
  return String(res.body);
}

describe('Export', () => {
  it('internal trainer GET /api/attendance/export?format=csv returns CSV with Date and Status headers', async () => {
    requireDb();

    const { token } = await loginUser(app, 'internal1', 'trainer123');

    const batch = await prisma.batch.findFirst({
      where: { name: 'Batch 1', department: { name: 'CSE' } },
      select: { id: true },
    });
    if (!batch) throw new Error('CSE Batch 1 not found');

    const res = await request(app)
      .get(`/api/attendance/export?format=csv&batchId=${batch.id}`)
      .set(authHeader(token));

    expect(res.status).toBe(200);
    const contentType = String(res.headers['content-type'] ?? '');
    expect(contentType.toLowerCase()).toMatch(/csv|text/);

    const text = bodyAsText(res);
    expect(text).toContain('Date');
    expect(text).toContain('Status');
  });

  it('internal trainer GET /api/feedback/export?format=csv is aggregated and contains no register numbers', async () => {
    requireDb();

    const { token } = await loginUser(app, 'internal1', 'trainer123');

    const res = await request(app)
      .get('/api/feedback/export?format=csv')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    const contentType = String(res.headers['content-type'] ?? '');
    expect(contentType.toLowerCase()).toMatch(/csv|text/);

    const text = bodyAsText(res);
    expect(text).toMatch(/Question|Average Rating/);
    expect(text.toLowerCase()).not.toContain('register number');
    expect(text).not.toMatch(/2023CSE\d{3}/i);
  });
});
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../app';
import prisma from '../lib/prisma';
import { loginUser, authHeader, requireDb } from './helpers';
import { isDbAvailable } from './setup';

describe('Attendance', () => {
  let sessionId: string;
  let batchId: string;
  let studentId: string;

  beforeAll(async () => {
    if (!isDbAvailable()) return;

    const session = await prisma.session.findFirst({
      where: { subject: { contains: 'Python' }, sessionType: 'FORENOON' },
      select: { id: true },
    });
    if (!session) throw new Error('FORENOON Python session not found');
    sessionId = session.id;

    const batch = await prisma.batch.findFirst({
      where: { name: 'Batch 1', department: { name: 'CSE' } },
      select: { id: true },
    });
    if (!batch) throw new Error('CSE Batch 1 not found');
    batchId = batch.id;

    const student = await prisma.student.findFirst({
      where: { batch: { name: 'Batch 1' }, department: { name: 'CSE' }, isActive: true },
      select: { id: true },
    });
    if (!student) throw new Error('no student in CSE Batch 1');
    studentId = student.id;
  });

  it('POST /api/attendance/bulk-mark marks PRESENT then ABSENT updates without duplicates', async () => {
    requireDb();

    const { token } = await loginUser(app, 'internal1', 'trainer123');

    const created = await request(app)
      .post('/api/attendance/bulk-mark')
      .set(authHeader(token))
      .send({
        sessionId,
        batchId,
        attendances: [{ studentId, status: 'PRESENT' }],
      });

    expect([200, 201]).toContain(created.status);

    const updated = await request(app)
      .post('/api/attendance/bulk-mark')
      .set(authHeader(token))
      .send({
        sessionId,
        batchId,
        attendances: [{ studentId, status: 'ABSENT' }],
      });

    expect([200, 201]).toContain(updated.status);

    const records = await prisma.attendance.findMany({
      where: { sessionId, studentId },
    });
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe('ABSENT');
  });

  it('POST /api/attendance/mark with OD then PENDING persists both without conversion', async () => {
    requireDb();

    const { token } = await loginUser(app, 'internal1', 'trainer123');

    const odRes = await request(app)
      .post('/api/attendance/mark')
      .set(authHeader(token))
      .send({ sessionId, studentId, status: 'OD' });

    expect(odRes.status).toBe(200);

    const pendingRes = await request(app)
      .post('/api/attendance/mark')
      .set(authHeader(token))
      .send({ sessionId, studentId, status: 'PENDING' });

    expect([200, 201]).toContain(pendingRes.status);

    const record = await prisma.attendance.findUnique({
      where: { sessionId_studentId: { sessionId, studentId } },
    });
    expect(record).not.toBeNull();
    expect(record?.status).toBe('PENDING');
  });

  it('POST /api/attendance/submit marks the session attendance as submitted', async () => {
    requireDb();

    const { token } = await loginUser(app, 'internal1', 'trainer123');

    const res = await request(app)
      .post('/api/attendance/submit')
      .set(authHeader(token))
      .send({ sessionId });

    expect(res.status).toBe(200);

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { attendanceStatus: true },
    });
    expect(session?.attendanceStatus).toBe('SUBMITTED');
  });

  it('audit log contains an ATTENDANCE_MARK entry for the marked student', async () => {
    requireDb();

    const { token } = await loginUser(app, 'admin', 'admin123');

    const res = await request(app)
      .get('/api/audit-logs?action=ATTENDANCE_MARK&entity=ATTENDANCE')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.logs.length).toBeGreaterThan(0);

    const raw = JSON.stringify(res.body.logs);
    expect(raw).toContain(studentId);
  });
});
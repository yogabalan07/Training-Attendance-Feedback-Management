import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app';
import prisma from '../lib/prisma';
import { loginUser, authHeader, requireDb } from './helpers';

describe('Authorization – critical security tests', () => {
  // ──────────────────────────────────────────────────────
  // 1. Student can log in and GET /api/auth/me
  // ──────────────────────────────────────────────────────
  it('student logs in and GET /api/auth/me returns own user only', async () => {
    requireDb();

    const { token, user } = await loginUser(app, '2023cse001@student', 'student123');
    expect(user.role).toBe('STUDENT');

    const me = await request(app)
      .get('/api/auth/me')
      .set(authHeader(token));

    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe(user.id);
    expect(me.body.user.loginId).toBe('2023cse001@student');
  });

  // ──────────────────────────────────────────────────────
  // 2. Student can view own attendance; another student → 403
  // ──────────────────────────────────────────────────────
  it('student can view own attendance but not another student\'s', async () => {
    requireDb();

    const { token, user } = await loginUser(app, '2023cse001@student', 'student123');

    const student = await prisma.student.findFirst({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!student) throw new Error('student profile not found for 2023cse001@student');

    // Own attendance is accessible via the student-scoped route.
    const own = await request(app)
      .get(`/api/students/${student.id}/attendance`)
      .set(authHeader(token));

    expect(own.status).toBe(200);
    expect(Array.isArray(own.body)).toBe(true);

    const otherStudent = await prisma.student.findFirst({
      where: { id: { not: student.id } },
      select: { id: true },
    });
    if (!otherStudent) throw new Error('no other student found in DB');

    // A student must NEVER be able to read another student's attendance.
    const other = await request(app)
      .get(`/api/attendance/student/${otherStudent.id}`)
      .set(authHeader(token));

    expect(other.status).toBe(403);
  });

  // ──────────────────────────────────────────────────────
  // 3. CSE HOD GET /api/students?departmentId=CSE → CSE only; ECE → empty/403
  // ──────────────────────────────────────────────────────
  it('CSE HOD sees only CSE students, not ECE', async () => {
    requireDb();

    const { token } = await loginUser(app, 'csehod', 'hod123');

    const cseDept = await prisma.department.findUnique({ where: { name: 'CSE' } });
    const eceDept = await prisma.department.findUnique({ where: { name: 'ECE' } });
    if (!cseDept || !eceDept) throw new Error('CSE or ECE department not found');

    const cseRes = await request(app)
      .get(`/api/students?departmentId=${cseDept.id}`)
      .set(authHeader(token));

    expect(cseRes.status).toBe(200);
    expect(cseRes.body.students).toBeDefined();
    expect(cseRes.body.students.length).toBeGreaterThan(0);
    for (const s of cseRes.body.students) {
      expect(s.departmentId).toBe(cseDept.id);
    }

    const eceRes = await request(app)
      .get(`/api/students?departmentId=${eceDept.id}`)
      .set(authHeader(token));

    if (eceRes.status === 200) {
      expect(eceRes.body.students).toHaveLength(0);
    } else {
      expect(eceRes.status).toBe(403);
    }
  });

  // ──────────────────────────────────────────────────────
  // 4. CSE HOD cannot POST /api/students → 403
  // ──────────────────────────────────────────────────────
  it('CSE HOD cannot create students (no students.create permission)', async () => {
    requireDb();

    const { token } = await loginUser(app, 'csehod', 'hod123');
    const cseDept = await prisma.department.findUnique({ where: { name: 'CSE' } });
    const cseYear = await prisma.academicYear.findFirst({
      where: { department: { name: 'CSE' }, year: 1 },
    });
    const cseBatch = await prisma.batch.findFirst({
      where: { department: { name: 'CSE' }, name: 'Batch 1' },
    });
    if (!cseDept || !cseYear || !cseBatch) throw new Error('seed entities not found');

    const res = await request(app)
      .post('/api/students')
      .set(authHeader(token))
      .send({
        registerNumber: 'TEST999',
        name: 'Should Fail',
        departmentId: cseDept.id,
        academicYearId: cseYear.id,
        batchId: cseBatch.id,
      });

    expect(res.status).toBe(403);
  });

  // ──────────────────────────────────────────────────────
  // 5. staff1 (view-only) cannot POST /api/attendance/mark → 403
  // ──────────────────────────────────────────────────────
  it('staff1 (view-only) cannot mark attendance', async () => {
    requireDb();

    const { token } = await loginUser(app, 'staff1', 'staff123');

    const session = await prisma.session.findFirst({
      where: { subject: { contains: 'Python' } },
    });
    const student = await prisma.student.findFirst({
      where: { batch: { name: 'Batch 1' }, department: { name: 'CSE' } },
    });
    if (!session || !student) throw new Error('seed session/student not found');

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

  // ──────────────────────────────────────────────────────
  // 6. staff1 CAN GET /api/attendance → 200
  // ──────────────────────────────────────────────────────
  it('staff1 (view-only) can view attendance list', async () => {
    requireDb();

    const { token } = await loginUser(app, 'staff1', 'staff123');

    const res = await request(app)
      .get('/api/attendance')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
  });

  // ──────────────────────────────────────────────────────
  // 7. Internal trainer without users.create → 403
  // ──────────────────────────────────────────────────────
  it('internal trainer cannot create users', async () => {
    requireDb();

    const { token } = await loginUser(app, 'internal1', 'trainer123');

    const res = await request(app)
      .post('/api/users')
      .set(authHeader(token))
      .send({
        name: 'Should Fail',
        loginId: 'fail_user',
        password: 'password123',
        role: 'STUDENT',
      });

    expect(res.status).toBe(403);
  });

  // ──────────────────────────────────────────────────────
  // 8. External trainer cannot see another trainer's batch via my-assignments
  // ──────────────────────────────────────────────────────
  it('external trainer only sees own assigned batches via my-assignments', async () => {
    requireDb();

    const ext1 = await loginUser(app, 'external1', 'trainer123');
    const ext2 = await loginUser(app, 'external2', 'trainer123');

    const ext1Trainer = await prisma.trainer.findFirst({
      where: { user: { loginId: 'external1' } },
      select: { id: true },
    });
    const ext2Trainer = await prisma.trainer.findFirst({
      where: { user: { loginId: 'external2' } },
      select: { id: true },
    });
    if (!ext1Trainer || !ext2Trainer) throw new Error('trainer profiles not found');

    const ext2AssignedBatchIds = (
      await prisma.trainerAssignment.findMany({
        where: { trainerId: ext2Trainer.id },
        select: { batchId: true },
      })
    ).map((a) => a.batchId);

    expect(ext2AssignedBatchIds.length).toBeGreaterThan(0);

    const res = await request(app)
      .get('/api/trainer-assignments/my-assignments')
      .set(authHeader(ext1.token));

    expect(res.status).toBe(200);
    const returnedBatchIds: string[] = (res.body.assignments as { batchId: string }[]).map(
      (a) => a.batchId
    );

    for (const ext2BatchId of ext2AssignedBatchIds) {
      expect(returnedBatchIds).not.toContain(ext2BatchId);
    }
  });
});

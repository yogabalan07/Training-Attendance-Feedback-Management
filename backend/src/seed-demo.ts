import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const log = (msg: string) => console.log(`  ${msg}`);
const section = (title: string) => console.log(`\n── ${title} ──`);

function isoDate(y: number, m: number, d: number): Date {
  return new Date(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T00:00:00.000Z`);
}

function pickRating(idx: number): number {
  // Deterministic pseudo ratings between 3 and 5
  return 3 + ((idx * 7 + 3) % 3);
}

// Date config: [year, month, day, label]
type DateDef = [string, string, string];

const COMPLETED_DATES: DateDef[] = [
  ['2026', '09', '07'],
  ['2026', '09', '09'],
  ['2026', '09', '11'],
  ['2026', '09', '14'],
  ['2026', '09', '15'],
  ['2026', '09', '16'],
];

const FUTURE_DATES: DateDef[] = [
  ['2026', '09', '21'],
  ['2026', '09', '23'],
  ['2026', '09', '25'],
];

const FORENOON_TOPICS = [
  'Introduction to Python',
  'Data Structures Basics',
  'SQL Fundamentals',
  'Computer Networks Intro',
  'Operating Systems Overview',
  'Version Control with Git',
];

const AFTERNOON_TOPICS = [
  'Python - Functions & Modules',
  'Algorithms & Complexity',
  'Database Design',
  'Network Protocols',
  'Process Management',
  'Collaboration & Code Review',
];

async function main() {
  const admin = await prisma.user.findUnique({ where: { loginId: 'admin' } });
  const ext1User = await prisma.user.findUnique({ where: { loginId: 'external1' } });
  if (!admin || !ext1User) {
    throw new Error('Run `npm run seed` first before seeding demo data');
  }

  const trainer = await prisma.trainer.findUnique({ where: { userId: ext1User.id } });
  const dept = await prisma.department.findUnique({ where: { name: 'CSE' } });
  if (!trainer || !dept) throw new Error('Expected CSE department and external1 trainer to exist');

  const batch = await prisma.batch.findFirst({
    where: { departmentId: dept.id, name: 'Batch 1', isActive: true },
  });
  if (!batch) throw new Error('Expected CSE Batch 1 to exist');

  const students = await prisma.student.findMany({
    where: { batchId: batch.id, isActive: true },
    orderBy: { registerNumber: 'asc' },
  });
  if (students.length === 0) throw new Error('No students found in CSE Batch 1');

  const academicYear = await prisma.academicYear.findUnique({ where: { id: batch.academicYearId } });
  if (!academicYear) throw new Error('Batch academic year not found');

  const trainerId = trainer.id;
  const deptId = dept.id;
  const batchId = batch.id;
  const academicYearId = academicYear.id;

  const questions = await prisma.feedbackQuestion.findMany({
    where: { isActive: true },
    orderBy: { order: 'asc' },
  });
  if (questions.length === 0) throw new Error('No active feedback questions found');

  // ─── Sessions ─────────────────────────────────────────
  section('Creating sessions');

  async function upsertSession(
    date: Date,
    sessionType: 'FORENOON' | 'AFTERNOON',
    topic: string,
    status: 'COMPLETED' | 'SCHEDULED' | 'ONGOING',
    attendanceStatus: 'NOT_STARTED' | 'SUBMITTED' | 'IN_PROGRESS'
  ) {
    await prisma.$executeRaw`
      INSERT INTO "Session" ("id", "date", "sessionType", "startTime", "endTime", "subject", "topic", "trainerId", "departmentId", "academicYearId", "attendanceStatus", "status", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${date}, ${sessionType}, ${sessionType === 'FORENOON' ? '09:00' : '14:00'}, ${sessionType === 'FORENOON' ? '12:00' : '17:00'}, ${sessionType === 'FORENOON' ? 'Python Programming' : 'Python Programming'}, ${topic}, ${trainerId}, ${deptId}, ${academicYearId}, ${attendanceStatus}, ${status}, NOW(), NOW())
      ON CONFLICT ("date", "sessionType", "departmentId", "academicYearId", "trainerId") DO NOTHING
    `;

    const session = await prisma.session.findFirst({
      where: {
        date,
        sessionType,
        departmentId: deptId,
        academicYearId: academicYearId,
        trainerId: trainerId,
      },
    });
    if (!session) throw new Error('Failed to locate created session');

    await prisma.$executeRaw`
      INSERT INTO "SessionBatch" ("id", "sessionId", "batchId")
      VALUES (gen_random_uuid(), ${session.id}, ${batchId})
      ON CONFLICT ("sessionId", "batchId") DO NOTHING
    `;
    return session;
  }

  const completerSessionIds: string[] = [];

  for (const [fIdx, [y, mo, d]] of COMPLETED_DATES.entries()) {
    const date = isoDate(Number(y), Number(mo), Number(d));
    const fn = await upsertSession(date, 'FORENOON', FORENOON_TOPICS[fIdx] ?? 'Python Programming', 'COMPLETED', 'SUBMITTED');
    completerSessionIds.push(fn.id);
    const isLast = fIdx === COMPLETED_DATES.length - 1;
    if (isLast) {
      await upsertSession(date, 'AFTERNOON', AFTERNOON_TOPICS[fIdx] ?? 'Python - Lab', 'ONGOING', 'IN_PROGRESS');
      log(`✓ ${y}-${mo}-${d}: ${FORENOON_TOPICS[fIdx] ?? 'Session'} (FN completed) / AFTERNOON (AN ongoing)`);
    } else {
      const an = await upsertSession(date, 'AFTERNOON', AFTERNOON_TOPICS[fIdx] ?? 'Python - Lab', 'COMPLETED', 'SUBMITTED');
      completerSessionIds.push(an.id);
      log(`✓ ${y}-${mo}-${d}: ${FORENOON_TOPICS[fIdx] ?? 'Session'} (FN) / AFTERNOON (AN)`);
    }
  }

  for (const [fIdx, [y, mo, d]] of FUTURE_DATES.entries()) {
    const date = isoDate(Number(y), Number(mo), Number(d));
    const fn = await upsertSession(date, 'FORENOON', 'Component Architecture', 'SCHEDULED', 'NOT_STARTED');
    const an = await upsertSession(date, 'AFTERNOON', 'RESTful Principles', 'SCHEDULED', 'NOT_STARTED');
    void fn;
    void an;
    log(`✓ ${y}-${mo}-${d}: scheduled React / API sessions`);
  }

  // ─── Attendance ───────────────────────────────────────
  section('Marking attendance');

  let marked = 0;
  for (let si = 0; si < completerSessionIds.length; si++) {
    const sessionId = completerSessionIds[si];
    const rows = students.map((student, i) => {
      // First student absent on odd sessions, OD on every 5th, rest present
      let status: 'PRESENT' | 'ABSENT' | 'OD' | 'PENDING' = 'PRESENT';
      if (i % 12 === 3) status = 'ABSENT';
      else if (i % 9 === 5) status = 'OD';
      else if (i % 17 === 7) status = 'PENDING';
      return {
        id: sessionId,
        studentId: student.id,
        status,
      };
    });

    await prisma.$transaction(
      rows.map((r) =>
        prisma.attendance.upsert({
          where: { sessionId_studentId: { sessionId: r.id, studentId: r.studentId } },
          create: {
            sessionId: r.id,
            studentId: r.studentId,
            status: r.status,
            markedBy: ext1User.id,
            markedAt: new Date(),
            isSubmitted: true,
            submittedAt: new Date(),
            submittedBy: admin.id,
          },
          update: { status: r.status },
        })
      )
    );
    marked += rows.length;

    await prisma.session.update({
      where: { id: sessionId },
      data: { attendanceStatus: 'SUBMITTED', status: 'COMPLETED' },
    });
  }

  // Today's afternoon session: partially marked (in progress)
  const today = isoDate(2026, 9, 16);
  const afternoonToday = await prisma.session.findFirst({
    where: {
      date: today,
      sessionType: 'AFTERNOON',
      departmentId: dept.id,
      academicYearId: academicYear.id,
      trainerId: trainer.id,
    },
  });
  if (afternoonToday) {
    const inProgressRows = students.slice(0, Math.ceil(students.length / 2)).map((student, i) => ({
      sessionId: afternoonToday.id,
      studentId: student.id,
      status: (i % 4 === 1 ? 'PRESENT' : i % 7 === 2 ? 'ABSENT' : 'PENDING') as 'PRESENT' | 'ABSENT' | 'PENDING',
    }));
    await prisma.$transaction(
      inProgressRows.map((r) =>
        prisma.attendance.upsert({
          where: { sessionId_studentId: { sessionId: r.sessionId, studentId: r.studentId } },
          create: {
            sessionId: r.sessionId,
            studentId: r.studentId,
            status: r.status,
            markedBy: ext1User.id,
            markedAt: new Date(),
            isSubmitted: false,
          },
          update: { status: r.status, isSubmitted: false },
        })
      )
    );
    marked += inProgressRows.length;
    await prisma.session.update({
      where: { id: afternoonToday.id },
      data: { attendanceStatus: 'IN_PROGRESS', status: 'ONGOING' },
    });
    log(`✓ Today AFTERNOON: marked ${inProgressRows.length}/${students.length} (IN_PROGRESS)`);
  }

  log(`✓ Attendance records created: ${marked}`);

  // ─── Feedback ─────────────────────────────────────────
  section('Seeding feedback responses');

  let feedbackCount = 0;
  const answeredSessions = completerSessionIds.filter((_, i) => i % 2 === 0); // one per day
  for (const sessionId of answeredSessions) {
    const responses: { id: string; sessionId: string; studentId: string; names: string[] }[] = [];
    for (let i = 0; i < students.length; i++) {
      const student = students[i];
      const existing = await prisma.feedbackResponse.findUnique({
        where: { sessionId_studentId: { sessionId, studentId: student.id } },
      });
      if (existing) continue;

      const created = await prisma.feedbackResponse.create({
        data: {
          sessionId,
          studentId: student.id,
          submittedAt: new Date(),
          comments: `Insightful session. Grade feedback ${pickRating(i)}/5.`,
          answers: {
            create: questions.map((q, qi) => ({
              questionId: q.id,
              rating: pickRating(i + qi),
            })),
          },
        },
      });
      responses.push({ id: created.id, sessionId, studentId: student.id, names: [] });
      feedbackCount++;
    }
    if (responses.length > 0) {
      log(`✓ Feedback for session ${sessionId.slice(0, 8)}: ${responses.length} responses`);
    }
  }

  log(`✓ Feedback responses created: ${feedbackCount}`);

  console.log('\nDemo data seeding complete.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('\nDemo data seed failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
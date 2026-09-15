import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function log(msg: string) {
  console.log(`  ${msg}`);
}

function section(title: string) {
  console.log(`\n▸ ${title}`);
}

const PERMISSION_DEFS: { name: string; category: string; displayName: string }[] = [
  { name: 'users.view', category: 'users', displayName: 'View Users' },
  { name: 'users.create', category: 'users', displayName: 'Create Users' },
  { name: 'users.update', category: 'users', displayName: 'Update Users' },
  { name: 'users.disable', category: 'users', displayName: 'Disable Users' },
  { name: 'students.view', category: 'students', displayName: 'View Students' },
  { name: 'students.create', category: 'students', displayName: 'Create Students' },
  { name: 'students.update', category: 'students', displayName: 'Update Students' },
  { name: 'students.delete', category: 'students', displayName: 'Delete Students' },
  { name: 'trainers.view', category: 'trainers', displayName: 'View Trainers' },
  { name: 'trainers.create', category: 'trainers', displayName: 'Create Trainers' },
  { name: 'trainers.update', category: 'trainers', displayName: 'Update Trainers' },
  { name: 'departments.view', category: 'departments', displayName: 'View Departments' },
  { name: 'departments.create', category: 'departments', displayName: 'Create Departments' },
  { name: 'departments.update', category: 'departments', displayName: 'Update Departments' },
  { name: 'departments.delete', category: 'departments', displayName: 'Delete Departments' },
  { name: 'years.view', category: 'years', displayName: 'View Academic Years' },
  { name: 'years.create', category: 'years', displayName: 'Create Academic Years' },
  { name: 'years.update', category: 'years', displayName: 'Update Academic Years' },
  { name: 'batches.view', category: 'batches', displayName: 'View Batches' },
  { name: 'batches.create', category: 'batches', displayName: 'Create Batches' },
  { name: 'batches.update', category: 'batches', displayName: 'Update Batches' },
  { name: 'batches.delete', category: 'batches', displayName: 'Delete Batches' },
  { name: 'sessions.view', category: 'sessions', displayName: 'View Sessions' },
  { name: 'sessions.create', category: 'sessions', displayName: 'Create Sessions' },
  { name: 'sessions.update', category: 'sessions', displayName: 'Update Sessions' },
  { name: 'sessions.delete', category: 'sessions', displayName: 'Delete Sessions' },
  { name: 'attendance.view', category: 'attendance', displayName: 'View Attendance' },
  { name: 'attendance.mark', category: 'attendance', displayName: 'Mark Attendance' },
  { name: 'attendance.update', category: 'attendance', displayName: 'Update Attendance' },
  { name: 'attendance.export', category: 'attendance', displayName: 'Export Attendance' },
  { name: 'feedback.view', category: 'feedback', displayName: 'View Feedback' },
  { name: 'feedback.export', category: 'feedback', displayName: 'Export Feedback' },
  { name: 'trainer_assignments.view', category: 'trainer_assignments', displayName: 'View Trainer Assignments' },
  { name: 'trainer_assignments.create', category: 'trainer_assignments', displayName: 'Create Trainer Assignments' },
  { name: 'trainer_assignments.update', category: 'trainer_assignments', displayName: 'Update Trainer Assignments' },
  { name: 'trainer_assignments.delete', category: 'trainer_assignments', displayName: 'Delete Trainer Assignments' },
  { name: 'reports.view', category: 'reports', displayName: 'View Reports' },
  { name: 'reports.export', category: 'reports', displayName: 'Export Reports' },
  { name: 'permissions.view', category: 'permissions', displayName: 'View Permissions' },
  { name: 'permissions.manage', category: 'permissions', displayName: 'Manage Permissions' },
  { name: 'audit_logs.view', category: 'audit_logs', displayName: 'View Audit Logs' },
  { name: 'system_settings.manage', category: 'system_settings', displayName: 'Manage System Settings' },
];

const ALL_PERM_NAMES = PERMISSION_DEFS.map((p) => p.name);

const ROLE_DEFAULT_PERMS: Record<string, string[]> = {
  ADMIN: [...ALL_PERM_NAMES],
  INTERNAL_TRAINER: [
    'students.view', 'trainers.view', 'sessions.view', 'sessions.create', 'sessions.update',
    'attendance.view', 'attendance.mark', 'attendance.update', 'attendance.export',
    'feedback.view', 'feedback.export',
    'trainer_assignments.view', 'trainer_assignments.create', 'trainer_assignments.delete',
    'reports.view', 'reports.export',
  ],
  EXTERNAL_TRAINER: ['attendance.view', 'attendance.mark', 'feedback.view'],
  STUDENT: ['students.view'],
  CUSTOM_STAFF: [],
};

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  Smart Training Attendance - Database Seed   ║');
  console.log('╚══════════════════════════════════════════════╝');

  // 1. Permissions (batch upsert via raw SQL for speed)
  section('Seeding Permissions');
  for (const def of PERMISSION_DEFS) {
    await prisma.$executeRaw`
      INSERT INTO "Permission" ("id", "name", "category", "displayName", "createdAt")
      VALUES (gen_random_uuid(), ${def.name}, ${def.category}, ${def.displayName}, NOW())
      ON CONFLICT ("name") DO UPDATE SET "category" = ${def.category}, "displayName" = ${def.displayName}
    `;
  }
  const allPerms = await prisma.permission.findMany();
  const permMap: Record<string, string> = {};
  for (const p of allPerms) permMap[p.name] = p.id;
  log(`✓ ${allPerms.length} permissions seeded`);

  // 2. Roles
  section('Seeding Roles');
  const roleDefs = [
    { name: 'ADMIN', displayName: 'Admin', description: 'Full system access', isSystem: true },
    { name: 'INTERNAL_TRAINER', displayName: 'Internal Trainer', description: 'College faculty', isSystem: true },
    { name: 'EXTERNAL_TRAINER', displayName: 'External Trainer', description: 'Guest trainers', isSystem: true },
    { name: 'STUDENT', displayName: 'Student', description: 'Student attending sessions', isSystem: true },
    { name: 'CUSTOM_STAFF', displayName: 'Custom Staff', description: 'Staff with assigned permissions', isSystem: false },
  ];
  for (const rd of roleDefs) {
    await prisma.$executeRaw`
      INSERT INTO "Role" ("id", "name", "displayName", "description", "isSystem", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${rd.name}, ${rd.displayName}, ${rd.description}, ${rd.isSystem}, NOW(), NOW())
      ON CONFLICT ("name") DO UPDATE SET "displayName" = ${rd.displayName}, "description" = ${rd.description}, "isSystem" = ${rd.isSystem}, "updatedAt" = NOW()
    `;
  }
  const allRoles = await prisma.role.findMany();
  const roleMap: Record<string, string> = {};
  for (const r of allRoles) roleMap[r.name] = r.id;
  log(`✓ ${allRoles.length} roles seeded`);

  // 3. Role Default Permissions + Role Permissions (individual for Neon compatibility)
  section('Seeding Role Permissions');
  for (const [roleName, permNames] of Object.entries(ROLE_DEFAULT_PERMS)) {
    const roleId = roleMap[roleName];
    for (const permName of permNames) {
      const permId = permMap[permName];
      if (!permId) continue;
      await prisma.$executeRaw`
        INSERT INTO "RoleDefaultPermission" ("id", "roleId", "permissionId", "createdAt")
        VALUES (gen_random_uuid(), ${roleId}, ${permId}, NOW())
        ON CONFLICT ("roleId", "permissionId") DO NOTHING
      `;
      await prisma.$executeRaw`
        INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "createdAt")
        VALUES (gen_random_uuid(), ${roleId}, ${permId}, NOW())
        ON CONFLICT ("roleId", "permissionId") DO NOTHING
      `;
    }
    log(`✓ ${roleName}: ${permNames.length} permissions`);
  }

  // 4. Departments
  section('Seeding Departments');
  const deptDefs = [
    { name: 'CSE', code: 'CS' },
    { name: 'ECE', code: 'EC' },
    { name: 'EEE', code: 'EE' },
    { name: 'MECH', code: 'ME' },
    { name: 'CIVIL', code: 'CV' },
  ];
  for (const dd of deptDefs) {
    await prisma.$executeRaw`
      INSERT INTO "Department" ("id", "name", "code", "isActive", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${dd.name}, ${dd.code}, true, NOW(), NOW())
      ON CONFLICT ("name") DO UPDATE SET "code" = ${dd.code}, "updatedAt" = NOW()
    `;
  }
  const allDepts = await prisma.department.findMany();
  const deptMap: Record<string, string> = {};
  for (const d of allDepts) deptMap[d.name] = d.id;
  log(`✓ ${allDepts.length} departments`);

  // 5. Academic Years
  section('Seeding Academic Years');
  const yearLabels = ['First Year', 'Second Year', 'Third Year', 'Fourth Year'];
  const yearMap: Record<string, Record<number, string>> = {};
  for (const deptName of Object.keys(deptMap)) {
    yearMap[deptName] = {};
    for (let y = 1; y <= 4; y++) {
      await prisma.$executeRaw`
        INSERT INTO "AcademicYear" ("id", "year", "label", "departmentId", "isActive", "createdAt", "updatedAt")
        VALUES (gen_random_uuid(), ${y}, ${yearLabels[y - 1]}, ${deptMap[deptName]}, true, NOW(), NOW())
        ON CONFLICT ("year", "departmentId") DO UPDATE SET "label" = ${yearLabels[y - 1]}, "updatedAt" = NOW()
      `;
      const ay = await prisma.academicYear.findUnique({ where: { year_departmentId: { year: y, departmentId: deptMap[deptName] } } });
      if (ay) yearMap[deptName][y] = ay.id;
    }
    log(`✓ ${deptName}: 4 academic years`);
  }

  // 6. Batches
  section('Seeding Batches');
  const batchMap: Record<string, Record<string, string>> = {};
  const cseBatchPlan = [
    { name: 'Batch 1', year: 1 }, { name: 'Batch 2', year: 1 }, { name: 'Batch 3', year: 1 },
    { name: 'Batch 4', year: 2 }, { name: 'Batch 5', year: 2 },
    { name: 'Batch 6', year: 3 }, { name: 'Batch 7', year: 3 },
    { name: 'Batch 8', year: 4 }, { name: 'Batch 9', year: 4 },
  ];
  batchMap['CSE'] = {};
  for (const bp of cseBatchPlan) {
    await prisma.$executeRaw`
      INSERT INTO "Batch" ("id", "name", "departmentId", "academicYearId", "isActive", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${bp.name}, ${deptMap['CSE']}, ${yearMap['CSE'][bp.year]}, true, NOW(), NOW())
      ON CONFLICT ("name", "departmentId", "academicYearId") DO NOTHING
    `;
    const batch = await prisma.batch.findUnique({
      where: { name_departmentId_academicYearId: { name: bp.name, departmentId: deptMap['CSE'], academicYearId: yearMap['CSE'][bp.year] } },
    });
    if (batch) batchMap['CSE'][bp.name] = batch.id;
  }
  log(`✓ CSE: 9 batches`);

  for (const deptName of ['ECE', 'EEE', 'MECH', 'CIVIL']) {
    batchMap[deptName] = {};
    for (let i = 1; i <= 2; i++) {
      const batchName = `Batch ${i}`;
      await prisma.$executeRaw`
        INSERT INTO "Batch" ("id", "name", "departmentId", "academicYearId", "isActive", "createdAt", "updatedAt")
        VALUES (gen_random_uuid(), ${batchName}, ${deptMap[deptName]}, ${yearMap[deptName][1]}, true, NOW(), NOW())
        ON CONFLICT ("name", "departmentId", "academicYearId") DO NOTHING
      `;
      const batch = await prisma.batch.findUnique({
        where: { name_departmentId_academicYearId: { name: batchName, departmentId: deptMap[deptName], academicYearId: yearMap[deptName][1] } },
      });
      if (batch) batchMap[deptName][batchName] = batch.id;
    }
    log(`✓ ${deptName}: 2 batches`);
  }

  // 7. Users
  section('Seeding Users');
  const passwordHash = (pw: string) => bcrypt.hashSync(pw, 10);

  async function upsertUser(loginId: string, name: string, role: string, pw: string, extra: Record<string, any> = {}) {
    const hash = passwordHash(pw);
    await prisma.$executeRaw`
      INSERT INTO "User" ("id", "loginId", "passwordHash", "name", "role", "isActive", "createdAt", "updatedAt", "departmentId", "academicYearId", "batchId", "scopeType", "scopeValue")
      VALUES (gen_random_uuid(), ${loginId}, ${hash}, ${name}, ${role}, true, NOW(), NOW(), ${extra.departmentId || null}, ${extra.academicYearId || null}, ${extra.batchId || null}, ${extra.scopeType || null}, ${extra.scopeValue || null})
      ON CONFLICT ("loginId") DO UPDATE SET "passwordHash" = ${hash}, "updatedAt" = NOW()
    `;
    return await prisma.user.findUnique({ where: { loginId } });
  }

  const admin = await upsertUser('admin', 'System Administrator', 'ADMIN', 'admin123');
  const internal1 = await upsertUser('internal1', 'Internal Trainer 1', 'INTERNAL_TRAINER', 'trainer123');
  const internal2 = await upsertUser('internal2', 'Internal Trainer 2', 'INTERNAL_TRAINER', 'trainer123');
  const external1 = await upsertUser('external1', 'External Trainer 1', 'EXTERNAL_TRAINER', 'trainer123');
  const external2 = await upsertUser('external2', 'External Trainer 2', 'EXTERNAL_TRAINER', 'trainer123');
  const cseHod = await upsertUser('csehod', 'CSE HOD', 'CUSTOM_STAFF', 'hod123', {
    departmentId: deptMap['CSE'],
    scopeType: 'DEPARTMENT',
    scopeValue: 'CSE',
  });
  const staff1 = await upsertUser('staff1', 'View-Only Staff', 'CUSTOM_STAFF', 'staff123', {
    scopeType: 'ALL',
  });
  log(`✓ 7 users created`);

  // 8. Custom Staff User Permissions
  section('Seeding Custom Staff Permissions');
  const cseHodPerms = ['students.view', 'attendance.view', 'feedback.view', 'attendance.export', 'feedback.export'];
  for (const permName of cseHodPerms) {
    await prisma.$executeRaw`
      INSERT INTO "UserPermission" ("id", "userId", "permissionId", "granted", "createdAt")
      VALUES (gen_random_uuid(), ${cseHod!.id}, ${permMap[permName]}, true, NOW())
      ON CONFLICT ("userId", "permissionId") DO UPDATE SET "granted" = true
    `;
  }
  log(`✓ CSE HOD: ${cseHodPerms.length} permissions`);

  const staff1Perms = ['attendance.view', 'feedback.view'];
  for (const permName of staff1Perms) {
    await prisma.$executeRaw`
      INSERT INTO "UserPermission" ("id", "userId", "permissionId", "granted", "createdAt")
      VALUES (gen_random_uuid(), ${staff1!.id}, ${permMap[permName]}, true, NOW())
      ON CONFLICT ("userId", "permissionId") DO UPDATE SET "granted" = true
    `;
  }
  log(`✓ Staff1: ${staff1Perms.length} permissions`);

  // 9. Trainers
  section('Seeding Trainers');
  const trainerData = [
    { userId: internal1!.id, type: 'INTERNAL', spec: 'Computer Science & Programming', label: 'internal1' },
    { userId: internal2!.id, type: 'INTERNAL', spec: 'Data Structures & Algorithms', label: 'internal2' },
    { userId: external1!.id, type: 'EXTERNAL', spec: 'Python & Machine Learning', label: 'external1' },
    { userId: external2!.id, type: 'EXTERNAL', spec: 'Web Development & Cloud', label: 'external2' },
  ];
  const trainerMap: Record<string, string> = {};
  for (const td of trainerData) {
    await prisma.$executeRaw`
      INSERT INTO "Trainer" ("id", "userId", "type", "specialization", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${td.userId}, ${td.type}, ${td.spec}, NOW(), NOW())
      ON CONFLICT ("userId") DO UPDATE SET "specialization" = ${td.spec}, "updatedAt" = NOW()
    `;
    const trainer = await prisma.trainer.findUnique({ where: { userId: td.userId } });
    if (trainer) trainerMap[td.label] = trainer.id;
  }
  log(`✓ 4 trainer profiles`);

  // 10. Students (batch)
  section('Seeding Students');
  let studentCount = 0;
  const studentHash = passwordHash('student123');

  const cseBatchPlanStudents = [
    { batchName: 'Batch 1', year: 1, startReg: 1, count: 15 },
    { batchName: 'Batch 2', year: 1, startReg: 16, count: 15 },
    { batchName: 'Batch 3', year: 1, startReg: 31, count: 15 },
    { batchName: 'Batch 4', year: 2, startReg: 101, count: 15 },
    { batchName: 'Batch 5', year: 2, startReg: 116, count: 15 },
    { batchName: 'Batch 6', year: 3, startReg: 201, count: 15 },
    { batchName: 'Batch 7', year: 3, startReg: 216, count: 15 },
    { batchName: 'Batch 8', year: 4, startReg: 301, count: 15 },
    { batchName: 'Batch 9', year: 4, startReg: 316, count: 15 },
  ];

  async function createStudentBatch(items: { regNum: string; name: string; deptId: string; yearId: string; batchId: string }[]) {
    for (const s of items) {
      const loginId = `${s.regNum.toLowerCase()}@student`;
      await prisma.$executeRaw`
        INSERT INTO "User" ("id", "loginId", "passwordHash", "name", "role", "isActive", "createdAt", "updatedAt", "departmentId", "academicYearId", "batchId")
        VALUES (gen_random_uuid(), ${loginId}, ${studentHash}, ${s.name}, 'STUDENT', true, NOW(), NOW(), ${s.deptId}, ${s.yearId}, ${s.batchId})
        ON CONFLICT ("loginId") DO NOTHING
      `;
      const user = await prisma.user.findUnique({ where: { loginId } });
      await prisma.$executeRaw`
        INSERT INTO "Student" ("id", "registerNumber", "name", "email", "userId", "departmentId", "academicYearId", "batchId", "isActive", "createdAt", "updatedAt")
        VALUES (gen_random_uuid(), ${s.regNum}, ${s.name}, ${`${s.regNum.toLowerCase()}@college.edu`}, ${user?.id || null}, ${s.deptId}, ${s.yearId}, ${s.batchId}, true, NOW(), NOW())
        ON CONFLICT ("registerNumber") DO UPDATE SET "userId" = ${user?.id || null}, "updatedAt" = NOW()
      `;
      studentCount++;
    }
  }

  for (const bp of cseBatchPlanStudents) {
    const yearLabel = `20${23 + bp.year - 1}`;
    const items: { regNum: string; name: string; deptId: string; yearId: string; batchId: string }[] = [];
    for (let i = 0; i < bp.count; i++) {
      items.push({
        regNum: `${yearLabel}CSE${String(bp.startReg + i).padStart(3, '0')}`,
        name: `Student ${bp.startReg + i} - ${bp.batchName}`,
        deptId: deptMap['CSE'],
        yearId: yearMap['CSE'][bp.year],
        batchId: batchMap['CSE'][bp.batchName],
      });
    }
    await createStudentBatch(items);
    log(`✓ CSE ${bp.batchName} (Year ${bp.year}): ${bp.count} students`);
  }

  for (const deptName of ['ECE', 'EEE', 'MECH', 'CIVIL']) {
    const deptCode = deptName.slice(0, 2);
    const yearLabel = '2023';
    const batchNames = ['Batch 1', 'Batch 2'];
    for (const batchName of batchNames) {
      const batchIdx = batchNames.indexOf(batchName);
      const startReg = batchIdx * 8 + 1;
      const items: { regNum: string; name: string; deptId: string; yearId: string; batchId: string }[] = [];
      for (let i = 0; i < 8; i++) {
        items.push({
          regNum: `${yearLabel}${deptCode}${String(startReg + i).padStart(3, '0')}`,
          name: `Student ${startReg + i} - ${deptName} ${batchName}`,
          deptId: deptMap[deptName],
          yearId: yearMap[deptName][1],
          batchId: batchMap[deptName][batchName],
        });
      }
      await createStudentBatch(items);
      log(`✓ ${deptName} ${batchName}: 8 students`);
    }
  }
  log(`Total: ${studentCount} students`);

  // 11. Feedback Questions
  section('Seeding Feedback Questions');
  const fqDefs = [
    { question: "How would you rate the trainer's explanation quality?", category: 'TRAINER', order: 1 },
    { question: 'How well did you understand the subject content?', category: 'SESSION', order: 2 },
    { question: 'How practically useful was the session?', category: 'SESSION', order: 3 },
    { question: 'How interactive was the trainer during the session?', category: 'TRAINER', order: 4 },
    { question: 'How effective was the session overall?', category: 'SESSION', order: 5 },
    { question: 'Rate your overall satisfaction with the session', category: 'GENERAL', order: 6 },
  ];
  for (const fq of fqDefs) {
    const existing = await prisma.feedbackQuestion.findFirst({ where: { question: fq.question } });
    if (!existing) {
      await prisma.feedbackQuestion.create({ data: fq });
    }
  }
  log(`✓ ${fqDefs.length} feedback questions`);

  // 12. System Settings
  section('Seeding System Settings');
  const settingsDefs = [
    { key: 'attendance.min_percentage', value: '75', category: 'ATTENDANCE' },
    { key: 'attendance.od_in_denominator', value: 'false', category: 'ATTENDANCE' },
    { key: 'attendance.pending_in_denominator', value: 'false', category: 'ATTENDANCE' },
    { key: 'attendance.pending_warning_days', value: '2', category: 'ATTENDANCE' },
    { key: 'feedback.min_questions', value: '1', category: 'FEEDBACK' },
  ];
  for (const sd of settingsDefs) {
    await prisma.$executeRaw`
      INSERT INTO "SystemSetting" ("id", "key", "value", "category", "updatedAt")
      VALUES (gen_random_uuid(), ${sd.key}, ${sd.value}, ${sd.category}, NOW())
      ON CONFLICT ("key") DO UPDATE SET "value" = ${sd.value}, "category" = ${sd.category}, "updatedAt" = NOW()
    `;
  }
  log(`✓ ${settingsDefs.length} settings`);

  // 13. Trainer Assignments
  section('Seeding Trainer Assignments');
  const ext1Batches = [batchMap['CSE']['Batch 1'], batchMap['CSE']['Batch 2'], batchMap['CSE']['Batch 3']];
  for (const batchId of ext1Batches) {
    await prisma.$executeRaw`
      INSERT INTO "TrainerAssignment" ("id", "trainerId", "batchId", "departmentId", "academicYearId", "assignedBy", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${trainerMap['external1']}, ${batchId}, ${deptMap['CSE']}, ${yearMap['CSE'][1]}, ${admin!.id}, NOW(), NOW())
      ON CONFLICT ("trainerId", "batchId", "sessionId") DO NOTHING
    `;
  }
  log(`✓ external1 → CSE Batch 1,2,3`);

  const ext2Batches = [batchMap['CSE']['Batch 8'], batchMap['CSE']['Batch 9']];
  for (const batchId of ext2Batches) {
    await prisma.$executeRaw`
      INSERT INTO "TrainerAssignment" ("id", "trainerId", "batchId", "departmentId", "academicYearId", "assignedBy", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${trainerMap['external2']}, ${batchId}, ${deptMap['CSE']}, ${yearMap['CSE'][4]}, ${admin!.id}, NOW(), NOW())
      ON CONFLICT ("trainerId", "batchId", "sessionId") DO NOTHING
    `;
  }
  log(`✓ external2 → CSE Batch 8,9`);

  // 14. Demo Sessions
  section('Seeding Demo Sessions');
  const sessionDate = new Date('2026-09-15T00:00:00.000Z');

  await prisma.$executeRaw`
    INSERT INTO "Session" ("id", "date", "sessionType", "startTime", "endTime", "subject", "topic", "trainerId", "departmentId", "academicYearId", "attendanceStatus", "status", "createdAt", "updatedAt")
    VALUES (gen_random_uuid(), ${sessionDate}, 'FORENOON', '09:00', '12:00', 'Python Programming', 'Introduction to Python', ${trainerMap['external1']}, ${deptMap['CSE']}, ${yearMap['CSE'][1]}, 'NOT_STARTED', 'SCHEDULED', NOW(), NOW())
    ON CONFLICT ("date", "sessionType", "departmentId", "academicYearId", "trainerId") DO NOTHING
  `;
  const forenoonSession = await prisma.session.findFirst({
    where: { date: sessionDate, sessionType: 'FORENOON', departmentId: deptMap['CSE'], academicYearId: yearMap['CSE'][1], trainerId: trainerMap['external1'] },
  });

  if (forenoonSession) {
    const fbIds = [batchMap['CSE']['Batch 1'], batchMap['CSE']['Batch 2'], batchMap['CSE']['Batch 3']];
    for (const batchId of fbIds) {
      await prisma.$executeRaw`
        INSERT INTO "SessionBatch" ("id", "sessionId", "batchId")
        VALUES (gen_random_uuid(), ${forenoonSession.id}, ${batchId})
        ON CONFLICT ("sessionId", "batchId") DO NOTHING
      `;
    }
    log(`✓ FORENOON: Python Intro (Batches 1,2,3)`);
  }

  await prisma.$executeRaw`
    INSERT INTO "Session" ("id", "date", "sessionType", "startTime", "endTime", "subject", "topic", "trainerId", "departmentId", "academicYearId", "attendanceStatus", "status", "createdAt", "updatedAt")
    VALUES (gen_random_uuid(), ${sessionDate}, 'AFTERNOON', '14:00', '17:00', 'Python Programming', 'Python Programming - Advanced', ${trainerMap['external1']}, ${deptMap['CSE']}, ${yearMap['CSE'][1]}, 'NOT_STARTED', 'SCHEDULED', NOW(), NOW())
    ON CONFLICT ("date", "sessionType", "departmentId", "academicYearId", "trainerId") DO NOTHING
  `;
  const afternoonSession = await prisma.session.findFirst({
    where: { date: sessionDate, sessionType: 'AFTERNOON', departmentId: deptMap['CSE'], academicYearId: yearMap['CSE'][1], trainerId: trainerMap['external1'] },
  });
  if (afternoonSession) {
    const fbIds = [batchMap['CSE']['Batch 1'], batchMap['CSE']['Batch 2'], batchMap['CSE']['Batch 3']];
    for (const batchId of fbIds) {
      await prisma.$executeRaw`
        INSERT INTO "SessionBatch" ("id", "sessionId", "batchId")
        VALUES (gen_random_uuid(), ${afternoonSession.id}, ${batchId})
        ON CONFLICT ("sessionId", "batchId") DO NOTHING
      `;
    }
    log(`✓ AFTERNOON: Python Advanced (Batches 1,2,3)`);
  }

  // 15. Audit Logs
  section('Seeding Audit Logs');
  if (admin) {
    await prisma.auditLog.create({
      data: {
        userId: admin.id,
        action: 'LOGIN',
        entity: 'USER',
        entityId: admin.id,
        newValue: JSON.stringify({ loginId: 'admin' }),
        ipAddress: '127.0.0.1',
        userAgent: 'Seed Script',
      },
    });
    if (forenoonSession) {
      await prisma.auditLog.create({
        data: {
          userId: admin.id,
          action: 'CREATE',
          entity: 'SESSION',
          entityId: forenoonSession.id,
          newValue: JSON.stringify({ subject: 'Python Programming', sessionType: 'FORENOON' }),
          reason: 'Seed data',
          ipAddress: '127.0.0.1',
          userAgent: 'Seed Script',
        },
      });
    }
  }
  log('✓ 2 audit logs');

  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║           Seed Completed Successfully        ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`
  Login Credentials:
  ─────────────────────────────────────────
  Admin             │ admin       │ admin123
  Internal Trainer  │ internal1   │ trainer123
  Internal Trainer  │ internal2   │ trainer123
  External Trainer  │ external1   │ trainer123
  External Trainer  │ external2   │ trainer123
  CSE HOD (Staff)   │ csehod      │ hod123
  View-Only Staff   │ staff1      │ staff123
  Students: registerNumber@student / student123
  e.g. 2023CSE001@student / student123
  ─────────────────────────────────────────
  `);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('\nSeed failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });

import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { NotFoundError, ForbiddenError, ValidationError } from '../lib/errors';
import { authenticateToken } from '../middleware/auth';
import { requirePermission } from '../middleware/authorize';

const router = Router();

async function checkPermission(userId: string, permissionName: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      roleRelation: {
        include: { permissions: { include: { permission: true } } },
      },
      userPermissions: { include: { permission: true } },
    },
  });
  if (!user) return false;
  const rolePerms = user.roleRelation?.permissions.map((rp) => rp.permission.name) || [];
  const directPerms = user.userPermissions.filter((up) => up.granted).map((up) => up.permission.name);
  return new Set([...rolePerms, ...directPerms]).has(permissionName);
}

async function getStudentIdFromUserId(userId: string): Promise<string | null> {
  const student = await prisma.student.findUnique({ where: { userId }, select: { id: true } });
  return student?.id ?? null;
}

async function getTrainerFromUserId(userId: string) {
  return prisma.trainer.findUnique({ where: { userId }, select: { id: true, type: true } });
}

function parseDateParam(dateStr: string) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) throw new ValidationError('Invalid date format');
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  return { start, end };
}

function buildScopeFilter(user: { scopeType?: string | null; scopeValue?: string | null }) {
  if (!user.scopeType || user.scopeType === 'ALL') return {};
  if (user.scopeType === 'DEPARTMENT') return { departmentId: user.scopeValue! };
  if (user.scopeType === 'BATCH') {
    return { sessionBatches: { some: { batchId: user.scopeValue! } } };
  }
  return {};
}

function buildAttendanceScopeFilter(user: { scopeType?: string | null; scopeValue?: string | null }) {
  if (!user.scopeType || user.scopeType === 'ALL') return {};
  if (user.scopeType === 'DEPARTMENT') return { session: { departmentId: user.scopeValue! } };
  if (user.scopeType === 'BATCH') return { student: { batchId: user.scopeValue! } };
  return {};
}

function buildFeedbackScopeFilter(user: { scopeType?: string | null; scopeValue?: string | null }) {
  if (!user.scopeType || user.scopeType === 'ALL') return {};
  if (user.scopeType === 'DEPARTMENT') return { session: { departmentId: user.scopeValue! } };
  if (user.scopeType === 'BATCH') {
    return { session: { sessionBatches: { some: { batchId: user.scopeValue! } } } };
  }
  return {};
}

// ─── GET /attendance ───────────────────────────────────
router.get(
  '/attendance',
  authenticateToken,
  requirePermission('reports.view'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new ForbiddenError();

      const {
        groupBy,
        departmentId,
        academicYearId,
        batchId,
        trainerId,
        sessionId,
        startDate,
        endDate,
        studentId,
      } = req.query as Record<string, string | undefined>;

      const validGroupBy = ['student', 'batch', 'department', 'session', 'trainer', 'date'];
      const group = validGroupBy.includes(groupBy || '') ? groupBy! : 'student';

      const conditions: Record<string, unknown>[] = [];
      if (sessionId) conditions.push({ sessionId });
      if (studentId) conditions.push({ studentId });
      if (departmentId) conditions.push({ session: { departmentId } });
      if (academicYearId) conditions.push({ session: { academicYearId } });
      if (batchId) conditions.push({ student: { batchId } });
      if (trainerId) conditions.push({ session: { trainerId } });
      if (startDate || endDate) {
        const dateFilter: Record<string, Date> = {};
        if (startDate) dateFilter.gte = new Date(startDate);
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          dateFilter.lte = end;
        }
        conditions.push({ session: { date: dateFilter } });
      }

      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      if (user) {
        const scopeFilter = buildAttendanceScopeFilter(user);
        if (Object.keys(scopeFilter).length > 0) conditions.push(scopeFilter);
      }

      if (req.user.role === 'STUDENT') {
        const sid = await getStudentIdFromUserId(req.user.id);
        if (sid) conditions.push({ studentId: sid });
      }

      if (req.user.role === 'EXTERNAL_TRAINER') {
        const trainer = await getTrainerFromUserId(req.user.id);
        if (trainer) {
          const assignments = await prisma.trainerAssignment.findMany({
            where: { trainerId: trainer.id },
            select: { batchId: true, sessionId: true },
          });
          const batchIds = [...new Set(assignments.map((a) => a.batchId))];
          const sIds = [...new Set(assignments.filter((a) => a.sessionId).map((a) => a.sessionId!))];
          const orConds: Record<string, unknown>[] = [];
          if (batchIds.length > 0) orConds.push({ student: { batchId: { in: batchIds } } });
          if (sIds.length > 0) orConds.push({ sessionId: { in: sIds } });
          if (orConds.length > 0) conditions.push({ OR: orConds });
        }
      }

      const where = conditions.length > 0 ? { AND: conditions } : {};

      const records = await prisma.attendance.findMany({
        where,
        include: {
          student: {
            select: {
              id: true,
              registerNumber: true,
              name: true,
              batchId: true,
              departmentId: true,
              batch: { select: { id: true, name: true } },
              department: { select: { id: true, name: true } },
            },
          },
          session: {
            select: {
              id: true,
              date: true,
              sessionType: true,
              subject: true,
              departmentId: true,
              academicYearId: true,
              trainerId: true,
              department: { select: { id: true, name: true } },
              academicYear: { select: { id: true, year: true, label: true } },
              trainer: { include: { user: { select: { id: true, name: true } } } },
            },
          },
        },
        orderBy: { markedAt: 'desc' },
      });

      type GroupedEntry = {
        key: string;
        label: string;
        total: number;
        present: number;
        absent: number;
        od: number;
        pending: number;
        percentage: number;
      };

      const groupMap: Record<string, GroupedEntry> = {};

      for (const r of records) {
        let groupKey: string;
        let groupLabel: string;

        switch (group) {
          case 'student':
            groupKey = r.student.id;
            groupLabel = `${r.student.registerNumber} - ${r.student.name}`;
            break;
          case 'batch':
            groupKey = r.student.batch.id;
            groupLabel = r.student.batch.name;
            break;
          case 'department':
            groupKey = r.session.department.id;
            groupLabel = r.session.department.name;
            break;
          case 'session':
            groupKey = r.session.id;
            groupLabel = `${new Date(r.session.date).toISOString().split('T')[0]} - ${r.session.sessionType} - ${r.session.subject}`;
            break;
          case 'trainer':
            groupKey = r.session.trainerId || 'unassigned';
            groupLabel = r.session.trainer?.user?.name || 'Unassigned';
            break;
          case 'date': {
            const dateStr = new Date(r.session.date).toISOString().split('T')[0];
            groupKey = dateStr;
            groupLabel = dateStr;
            break;
          }
          default:
            groupKey = r.student.id;
            groupLabel = r.student.name;
        }

        if (!groupMap[groupKey]) {
          groupMap[groupKey] = {
            key: groupKey,
            label: groupLabel,
            total: 0,
            present: 0,
            absent: 0,
            od: 0,
            pending: 0,
            percentage: 0,
          };
        }

        const entry = groupMap[groupKey];
        entry.total++;
        switch (r.status) {
          case 'PRESENT':
            entry.present++;
            break;
          case 'ABSENT':
            entry.absent++;
            break;
          case 'OD':
            entry.od++;
            break;
          case 'PENDING':
            entry.pending++;
            break;
        }
      }

      const data = Object.values(groupMap).map((entry) => ({
        ...entry,
        percentage:
          entry.total > 0
            ? Math.round(((entry.present + entry.od) / entry.total) * 10000) / 100
            : 0,
      }));

      data.sort((a, b) => b.percentage - a.percentage);

      const summary = {
        totalRecords: records.length,
        totalPresent: records.filter((r) => r.status === 'PRESENT').length,
        totalAbsent: records.filter((r) => r.status === 'ABSENT').length,
        totalOd: records.filter((r) => r.status === 'OD').length,
        totalPending: records.filter((r) => r.status === 'PENDING').length,
        overallPercentage:
          records.length > 0
            ? Math.round(
                ((records.filter((r) => r.status === 'PRESENT').length +
                  records.filter((r) => r.status === 'OD').length) /
                  records.length) *
                  10000
              ) / 100
            : 0,
      };

      res.json({ groupBy: group, summary, data });
    } catch (error) {
      next(error);
    }
  }
);

// ─── GET /feedback ─────────────────────────────────────
router.get(
  '/feedback',
  authenticateToken,
  requirePermission('reports.view'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new ForbiddenError();

      const {
        groupBy,
        departmentId,
        academicYearId,
        batchId,
        trainerId,
        sessionId,
        startDate,
        endDate,
      } = req.query as Record<string, string | undefined>;

      const validGroupBy = ['trainer', 'subject', 'batch', 'session', 'question'];
      const group = validGroupBy.includes(groupBy || '') ? groupBy! : 'trainer';

      const sessionConditions: Record<string, unknown>[] = [];
      if (sessionId) sessionConditions.push({ id: sessionId });
      if (departmentId) sessionConditions.push({ departmentId });
      if (academicYearId) sessionConditions.push({ academicYearId });
      if (batchId) sessionConditions.push({ sessionBatches: { some: { batchId } } });
      if (trainerId) sessionConditions.push({ trainerId });
      if (startDate || endDate) {
        const dateFilter: Record<string, Date> = {};
        if (startDate) dateFilter.gte = new Date(startDate);
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          dateFilter.lte = end;
        }
        sessionConditions.push({ date: dateFilter });
      }

      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      if (user) {
        const scopeFilter = buildScopeFilter(user);
        if (Object.keys(scopeFilter).length > 0) sessionConditions.push(scopeFilter);
      }

      const sessionWhere =
        sessionConditions.length > 0 ? { AND: sessionConditions } : {};

      const responses = await prisma.feedbackResponse.findMany({
        where: { session: sessionWhere },
        include: {
          answers: {
            include: {
              question: { select: { id: true, question: true, category: true } },
            },
          },
          session: {
            include: {
              trainer: { include: { user: { select: { id: true, name: true } } } },
              department: { select: { id: true, name: true } },
              academicYear: { select: { id: true, year: true, label: true } },
              sessionBatches: {
                include: { batch: { select: { id: true, name: true } } },
              },
            },
          },
        },
        orderBy: { submittedAt: 'desc' },
      });

      type FeedbackGroupEntry = {
        key: string;
        label: string;
        ratings: number[];
        totalResponses: number;
      };

      const groupMap: Record<string, FeedbackGroupEntry> = {};

      for (const resp of responses) {
        for (const answer of resp.answers) {
          let groupKey: string;
          let groupLabel: string;

          switch (group) {
            case 'trainer':
              groupKey = resp.session.trainerId || 'unassigned';
              groupLabel = resp.session.trainer?.user?.name || 'Unassigned';
              break;
            case 'subject':
              groupKey = resp.session.subject || 'unknown';
              groupLabel = resp.session.subject || 'Unknown';
              break;
            case 'batch':
              for (const sb of resp.session.sessionBatches) {
                const bKey = sb.batch.id;
                if (!groupMap[bKey]) {
                  groupMap[bKey] = {
                    key: bKey,
                    label: sb.batch.name,
                    ratings: [],
                    totalResponses: 0,
                  };
                }
                groupMap[bKey].ratings.push(answer.rating);
                groupMap[bKey].totalResponses++;
              }
              continue;
            case 'session':
              groupKey = resp.session.id;
              groupLabel = `${new Date(resp.session.date).toISOString().split('T')[0]} - ${resp.session.sessionType} - ${resp.session.subject}`;
              break;
            case 'question':
              groupKey = answer.questionId;
              groupLabel = answer.question.question;
              break;
            default:
              groupKey = resp.session.trainerId || 'unassigned';
              groupLabel = resp.session.trainer?.user?.name || 'Unassigned';
          }

          if (!groupMap[groupKey]) {
            groupMap[groupKey] = {
              key: groupKey,
              label: groupLabel,
              ratings: [],
              totalResponses: 0,
            };
          }
          groupMap[groupKey].ratings.push(answer.rating);
          groupMap[groupKey].totalResponses++;
        }
      }

      const data = Object.values(groupMap).map((entry) => {
        const avg =
          entry.ratings.length > 0
            ? Math.round(
                (entry.ratings.reduce((s, r) => s + r, 0) / entry.ratings.length) * 100
              ) / 100
            : 0;

        const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        for (const r of entry.ratings) {
          distribution[r]++;
        }

        return {
          key: entry.key,
          label: entry.label,
          averageRating: avg,
          totalResponses: entry.totalResponses,
          ratingDistribution: distribution,
        };
      });

      data.sort((a, b) => b.averageRating - a.averageRating);

      const allRatings = responses.flatMap((r) => r.answers.map((a) => a.rating));
      const summary = {
        totalResponses: responses.length,
        totalRatings: allRatings.length,
        overallAverage:
          allRatings.length > 0
            ? Math.round(
                (allRatings.reduce((s, r) => s + r, 0) / allRatings.length) * 100
              ) / 100
            : 0,
      };

      res.json({ groupBy: group, summary, data });
    } catch (error) {
      next(error);
    }
  }
);

// ─── GET /dashboard ────────────────────────────────────
router.get(
  '/dashboard',
  authenticateToken,
  requirePermission('reports.view'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new ForbiddenError();

      const today = new Date();
      const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      if (!user) throw new NotFoundError('User not found');

      const role = req.user.role;

      if (role === 'ADMIN') {
        const [
          totalUsers,
          totalStudents,
          totalTrainers,
          totalDepartments,
          todaySessions,
          submittedSessions,
          todaySessionCount,
          shortageCount,
          feedbackCount,
          totalSessions,
          completedSessions,
          activeSessions,
          recentActivity,
        ] = await Promise.all([
          prisma.user.count(),
          prisma.student.count({ where: { isActive: true } }),
          prisma.trainer.count(),
          prisma.department.count({ where: { isActive: true } }),
          prisma.session.count({
            where: { date: { gte: startOfToday, lte: endOfToday } },
          }),
          prisma.session.count({
            where: {
              date: { gte: startOfToday, lte: endOfToday },
              attendanceStatus: 'SUBMITTED',
            },
          }),
          prisma.session.count({
            where: { date: { gte: startOfToday, lte: endOfToday } },
          }),
          (async () => {
            const minSetting = await prisma.systemSetting.findUnique({
              where: { key: 'min_attendance_percentage' },
            });
            const minPct = parseFloat(minSetting?.value || '75');

            const students = await prisma.student.findMany({
              where: { isActive: true },
              include: { attendances: { select: { status: true } } },
            });

            return students.filter((s) => {
              const total = s.attendances.length;
              if (total === 0) return false;
              const present = s.attendances.filter((a) => a.status === 'PRESENT').length;
              const od = s.attendances.filter((a) => a.status === 'OD').length;
              return ((present + od) / total) * 100 < minPct;
            }).length;
          })(),
          prisma.feedbackResponse.count(),
          prisma.session.count(),
          prisma.session.count({ where: { status: 'COMPLETED' } }),
          prisma.session.count({
            where: { status: { in: ['SCHEDULED', 'ONGOING'] } },
          }),
          prisma.auditLog.findMany({
            orderBy: { createdAt: 'desc' },
            take: 10,
            include: {
              user: { select: { id: true, name: true, loginId: true } },
            },
          }),
        ]);

        const statusCounts = await prisma.attendance.groupBy({
          by: ['status'],
          _count: { _all: true },
        });
        const statusMap = Object.fromEntries(
          statusCounts.map((s) => [s.status, s._count._all])
        );
        const presentCount = statusMap.PRESENT ?? 0;
        const absentCount = statusMap.ABSENT ?? 0;
        const attendanceRate =
          presentCount + absentCount > 0
            ? (presentCount / (presentCount + absentCount)) * 100
            : 0;

        return res.json({
          role: 'ADMIN',
          totalUsers,
          totalStudents,
          totalTrainers,
          totalDepartments,
          todaySessions,
          totalSessions,
          completedSessions,
          activeSessions,
          attendanceRate: Math.round(attendanceRate * 100) / 100,
          feedbackCount,
          recentActivity,
          attendanceSubmission: {
            submitted: submittedSessions,
            total: todaySessionCount,
            pending: todaySessionCount - submittedSessions,
          },
          shortageStudentsCount: shortageCount,
          totalFeedbackResponses: feedbackCount,
        });
      }

      if (role === 'INTERNAL_TRAINER') {
        const trainer = await prisma.trainer.findUnique({ where: { userId: req.user.id } });
        if (!trainer) {
          return res.json({
            role: 'INTERNAL_TRAINER',
            assignedSessions: 0,
            pendingAttendance: 0,
            submittedAttendance: 0,
            averageFeedback: 0,
            shortageStudentsCount: 0,
          });
        }

        const [
          assignedSessions,
          pendingAttendance,
          submittedAttendance,
          feedbackResponses,
        ] = await Promise.all([
          prisma.session.count({ where: { trainerId: trainer.id } }),
          prisma.session.count({
            where: {
              trainerId: trainer.id,
              attendanceStatus: { in: ['NOT_STARTED', 'IN_PROGRESS'] },
            },
          }),
          prisma.session.count({
            where: { trainerId: trainer.id, attendanceStatus: 'SUBMITTED' },
          }),
          prisma.feedbackResponse.findMany({
            where: { session: { trainerId: trainer.id } },
            include: { answers: { select: { rating: true } } },
          }),
        ]);

        const allRatings = feedbackResponses.flatMap((r) => r.answers.map((a) => a.rating));
        const averageFeedback =
          allRatings.length > 0
            ? Math.round(
                (allRatings.reduce((s, r) => s + r, 0) / allRatings.length) * 100
              ) / 100
            : 0;

        const minSetting = await prisma.systemSetting.findUnique({
          where: { key: 'min_attendance_percentage' },
        });
        const minPct = parseFloat(minSetting?.value || '75');

        const assignedBatches = await prisma.trainerAssignment.findMany({
          where: { trainerId: trainer.id },
          select: { batchId: true },
        });
        const batchIds = [...new Set(assignedBatches.map((a) => a.batchId))];

        const students = await prisma.student.findMany({
          where: { batchId: { in: batchIds }, isActive: true },
          include: { attendances: { select: { status: true } } },
        });

        const shortageCount = students.filter((s) => {
          const total = s.attendances.length;
          if (total === 0) return false;
          const present = s.attendances.filter((a) => a.status === 'PRESENT').length;
          const od = s.attendances.filter((a) => a.status === 'OD').length;
          return ((present + od) / total) * 100 < minPct;
        }).length;

        return res.json({
          role: 'INTERNAL_TRAINER',
          assignedSessions,
          pendingAttendance,
          submittedAttendance,
          averageFeedback,
          shortageStudentsCount: shortageCount,
        });
      }

      if (role === 'EXTERNAL_TRAINER') {
        const trainer = await getTrainerFromUserId(req.user.id);
        if (!trainer) {
          return res.json({
            role: 'EXTERNAL_TRAINER',
            todaySessions: 0,
            assignedBatches: 0,
            pendingAttendance: 0,
            submittedAttendance: 0,
          });
        }

        const assignments = await prisma.trainerAssignment.findMany({
          where: { trainerId: trainer.id },
          select: { batchId: true, sessionId: true },
        });
        const batchIds = [...new Set(assignments.map((a) => a.batchId))];
        const assignedSessionIds = assignments.filter((a) => a.sessionId).map((a) => a.sessionId!);

        const sessionConditions: Record<string, unknown> = {
          OR: [
            ...(batchIds.length > 0
              ? [{ sessionBatches: { some: { batchId: { in: batchIds } } } }]
              : []),
            ...(assignedSessionIds.length > 0 ? [{ id: { in: assignedSessionIds } }] : []),
          ],
        };

        const [todaySessions, pendingAttendance, submittedAttendance] = await Promise.all([
          prisma.session.count({
            where: {
              ...sessionConditions,
              date: { gte: startOfToday, lte: endOfToday },
            },
          }),
          prisma.session.count({
            where: {
              ...sessionConditions,
              attendanceStatus: { in: ['NOT_STARTED', 'IN_PROGRESS'] },
            },
          }),
          prisma.session.count({
            where: {
              ...sessionConditions,
              attendanceStatus: 'SUBMITTED',
            },
          }),
        ]);

        return res.json({
          role: 'EXTERNAL_TRAINER',
          todaySessions,
          assignedBatches: batchIds.length,
          pendingAttendance,
          submittedAttendance,
        });
      }

      if (role === 'STUDENT') {
        const studentId = await getStudentIdFromUserId(req.user.id);
        if (!studentId) {
          return res.json({
            role: 'STUDENT',
            attendancePercentage: 0,
            present: 0,
            absent: 0,
            od: 0,
            pending: 0,
            upcomingSessions: 0,
            pendingFeedback: 0,
          });
        }

        const student = await prisma.student.findUnique({ where: { id: studentId } });
        if (!student) throw new NotFoundError('Student not found');

        const [attendances, upcomingSessions, completedSessions, feedbackResponses] =
          await Promise.all([
            prisma.attendance.findMany({
              where: { studentId },
              select: { status: true },
            }),
            prisma.session.findMany({
              where: {
                sessionBatches: { some: { batchId: student.batchId } },
                date: { gte: startOfToday },
                status: { not: 'CANCELLED' },
              },
              select: { id: true, date: true, sessionType: true, subject: true },
              orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
              take: 5,
            }),
            prisma.session.findMany({
              where: {
                sessionBatches: { some: { batchId: student.batchId } },
                status: 'COMPLETED',
              },
              select: { id: true },
            }),
            prisma.feedbackResponse.findMany({
              where: { studentId },
              select: { sessionId: true },
            }),
          ]);

        const total = attendances.length;
        const present = attendances.filter((a) => a.status === 'PRESENT').length;
        const absent = attendances.filter((a) => a.status === 'ABSENT').length;
        const od = attendances.filter((a) => a.status === 'OD').length;
        const pending = attendances.filter((a) => a.status === 'PENDING').length;
        const attendancePercentage =
          total > 0 ? Math.round(((present + od) / total) * 10000) / 100 : 0;

        const feedbackSessionIds = new Set(feedbackResponses.map((f) => f.sessionId));
        const pendingFeedbackCount = completedSessions.filter(
          (s) => !feedbackSessionIds.has(s.id)
        ).length;

        return res.json({
          role: 'STUDENT',
          attendancePercentage,
          present,
          absent,
          od,
          pending,
          upcomingSessions: upcomingSessions.map((s) => ({
            id: s.id,
            date: s.date,
            sessionType: s.sessionType,
            subject: s.subject,
          })),
          pendingFeedback: pendingFeedbackCount,
        });
      }

      res.json({ role, message: 'Dashboard not configured for this role' });
    } catch (error) {
      next(error);
    }
  }
);

export default router;

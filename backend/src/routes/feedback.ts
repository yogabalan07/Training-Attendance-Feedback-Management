import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from '../lib/errors';
import { createAuditLog } from '../lib/audit';
import { authenticateToken } from '../middleware/auth';
import { requirePermission } from '../middleware/authorize';
import { stringify } from 'csv-stringify/sync';
import * as XLSX from 'xlsx';

const router = Router();

const createQuestionSchema = z.object({
  question: z.string().min(1, 'Question text is required'),
  category: z.enum(['TRAINER', 'SESSION', 'SUBJECT', 'GENERAL'], {
    errorMap: () => ({ message: 'Category must be TRAINER, SESSION, SUBJECT, or GENERAL' }),
  }),
  order: z.number().int().min(0).optional().default(0),
});

const submitFeedbackSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
  comments: z.string().optional().nullable(),
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1, 'Question ID is required'),
        rating: z.number().int().min(1, 'Rating must be between 1 and 5').max(5, 'Rating must be between 1 and 5'),
      })
    )
    .min(1, 'At least one answer is required'),
});

function buildScopeFilter(user: { scopeType?: string | null; scopeValue?: string | null }) {
  if (!user.scopeType || user.scopeType === 'ALL') return {};
  if (user.scopeType === 'DEPARTMENT') return { session: { departmentId: user.scopeValue! } };
  if (user.scopeType === 'BATCH') {
    return {
      session: {
        sessionBatches: { some: { batchId: user.scopeValue! } },
      },
    };
  }
  return {};
}

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

// ─── GET /questions ────────────────────────────────────
router.get(
  '/questions',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const questions = await prisma.feedbackQuestion.findMany({
        where: { isActive: true },
        orderBy: { order: 'asc' },
      });
      res.json({ data: questions });
    } catch (error) {
      next(error);
    }
  }
);

// ─── POST /questions ───────────────────────────────────
router.post(
  '/questions',
  authenticateToken,
  requirePermission('permissions.manage'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new ForbiddenError();

      const parsed = createQuestionSchema.safeParse(req.body);
      if (!parsed.success) {
        const errors: Record<string, string[]> = {};
        parsed.error.issues.forEach((issue) => {
          const key = issue.path.join('.');
          if (!errors[key]) errors[key] = [];
          errors[key].push(issue.message);
        });
        throw new ValidationError('Validation failed', errors);
      }

      const { question, category, order } = parsed.data;

      const lastQuestion = await prisma.feedbackQuestion.findFirst({
        where: { category },
        orderBy: { order: 'desc' },
      });
      const finalOrder = order !== undefined ? order : (lastQuestion?.order ?? 0) + 1;

      const created = await prisma.feedbackQuestion.create({
        data: {
          question,
          category,
          order: finalOrder,
        },
      });

      await createAuditLog(prisma, {
        userId: req.user.id,
        action: 'CREATE',
        entity: 'FEEDBACK_QUESTION',
        entityId: created.id,
        newValue: { question, category, order: finalOrder },
      });

      res.status(201).json(created);
    } catch (error) {
      next(error);
    }
  }
);

// ─── GET / ─────────────────────────────────────────────
router.get(
  '/',
  authenticateToken,
  requirePermission('feedback.view'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new ForbiddenError();

      const {
        sessionId,
        departmentId,
        academicYearId,
        batchId,
        trainerId,
        page: pageStr,
        limit: limitStr,
      } = req.query as Record<string, string | undefined>;

      const page = Math.max(1, parseInt(pageStr || '1', 10));
      const limit = Math.min(100, Math.max(1, parseInt(limitStr || '20', 10)));
      const skip = (page - 1) * limit;

      const conditions: Record<string, unknown>[] = [];

      if (sessionId) conditions.push({ sessionId });
      if (departmentId) conditions.push({ session: { departmentId } });
      if (academicYearId) conditions.push({ session: { academicYearId } });
      if (batchId) conditions.push({ session: { sessionBatches: { some: { batchId } } } });
      if (trainerId) conditions.push({ session: { trainerId } });

      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      if (user) {
        const scopeFilter = buildScopeFilter(user);
        if (Object.keys(scopeFilter).length > 0) conditions.push(scopeFilter);
      }

      const where = conditions.length > 0 ? { AND: conditions } : {};

      const [records, total] = await Promise.all([
        prisma.feedbackResponse.findMany({
          where,
          include: {
            session: {
              include: {
                department: { select: { id: true, name: true } },
                academicYear: { select: { id: true, year: true, label: true } },
                trainer: { include: { user: { select: { id: true, name: true } } } },
                sessionBatches: {
                  include: { batch: { select: { id: true, name: true } } },
                },
              },
            },
            answers: {
              include: {
                question: { select: { id: true, question: true, category: true } },
              },
            },
          },
          orderBy: { submittedAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.feedbackResponse.count({ where }),
      ]);

      const anonymized = records.map((r) => ({
        id: r.id,
        session: {
          id: r.session.id,
          date: r.session.date,
          sessionType: r.session.sessionType,
          subject: r.session.subject,
          department: r.session.department,
          academicYear: r.session.academicYear,
          trainer: r.session.trainer?.user
            ? { id: r.session.trainer.user.id, name: r.session.trainer.user.name }
            : null,
          batches: r.session.sessionBatches.map((sb) => ({
            id: sb.batch.id,
            name: sb.batch.name,
          })),
        },
        comments: r.comments,
        answers: r.answers.map((a) => ({
          questionId: a.questionId,
          question: a.question.question,
          category: a.question.category,
          rating: a.rating,
        })),
        submittedAt: r.submittedAt,
      }));

      res.json({
        data: anonymized,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (error) {
      next(error);
    }
  }
);

// ─── POST / ────────────────────────────────────────────
router.post(
  '/',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new ForbiddenError();

      if (req.user.role !== 'STUDENT') {
        const allowed = await checkPermission(req.user.id, 'feedback.view');
        if (!allowed) {
          throw new ForbiddenError('Missing required permission: feedback.view');
        }
      }

      const parsed = submitFeedbackSchema.safeParse(req.body);
      if (!parsed.success) {
        const errors: Record<string, string[]> = {};
        parsed.error.issues.forEach((issue) => {
          const key = issue.path.join('.');
          if (!errors[key]) errors[key] = [];
          errors[key].push(issue.message);
        });
        throw new ValidationError('Validation failed', errors);
      }

      const { sessionId, comments, answers } = parsed.data;

      const session = await prisma.session.findUnique({ where: { id: sessionId } });
      if (!session) throw new NotFoundError('Session not found');
      if (session.status !== 'COMPLETED') {
        throw new ForbiddenError('Feedback can only be submitted for completed sessions');
      }

      const studentId = await getStudentIdFromUserId(req.user.id);
      if (!studentId) throw new NotFoundError('Student profile not found');

      if (req.user.role === 'STUDENT') {
        const student = await prisma.student.findUnique({ where: { id: studentId } });
        if (!student) throw new NotFoundError('Student not found');

        const batchLink = await prisma.sessionBatch.findFirst({
          where: { sessionId, batchId: student.batchId },
        });
        if (!batchLink) {
          throw new ForbiddenError('This session is not assigned to your batch');
        }
      }

      const existingFeedback = await prisma.feedbackResponse.findUnique({
        where: { sessionId_studentId: { sessionId, studentId } },
      });
      if (existingFeedback) {
        throw new ConflictError('You have already submitted feedback for this session');
      }

      const questionIds = answers.map((a) => a.questionId);
      const validQuestions = await prisma.feedbackQuestion.findMany({
        where: { id: { in: questionIds }, isActive: true },
        select: { id: true },
      });
      const validIds = new Set(validQuestions.map((q) => q.id));
      const invalidIds = questionIds.filter((id) => !validIds.has(id));
      if (invalidIds.length > 0) {
        throw new ValidationError('Some question IDs are invalid or inactive', {
          questionIds: invalidIds,
        });
      }

      const response = await prisma.feedbackResponse.create({
        data: {
          sessionId,
          studentId,
          comments: comments ?? null,
        },
        include: {
          answers: true,
        },
      });

      await prisma.feedbackAnswer.createMany({
        data: answers.map((a) => ({
          responseId: response.id,
          questionId: a.questionId,
          rating: a.rating,
        })),
      });

      const fullResponse = await prisma.feedbackResponse.findUnique({
        where: { id: response.id },
        include: {
          answers: {
            include: { question: { select: { id: true, question: true, category: true } } },
          },
        },
      });

      await createAuditLog(prisma, {
        userId: req.user.id,
        action: 'CREATE',
        entity: 'FEEDBACK_RESPONSE',
        entityId: response.id,
        newValue: { sessionId, answersCount: answers.length },
      });

      res.status(201).json(fullResponse);
    } catch (error) {
      next(error);
    }
  }
);

// ─── GET /analytics ────────────────────────────────────
router.get(
  '/analytics',
  authenticateToken,
  requirePermission('feedback.view'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new ForbiddenError();

      const {
        sessionId,
        trainerId,
        subject,
        departmentId,
        academicYearId,
        batchId,
        startDate,
        endDate,
      } = req.query as Record<string, string | undefined>;

      const sessionConditions: Record<string, unknown>[] = [];

      if (sessionId) sessionConditions.push({ id: sessionId });
      if (trainerId) sessionConditions.push({ trainerId });
      if (departmentId) sessionConditions.push({ departmentId });
      if (academicYearId) sessionConditions.push({ academicYearId });
      if (batchId) sessionConditions.push({ sessionBatches: { some: { batchId } } });
      if (subject) sessionConditions.push({ subject: { contains: subject } });
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

      const sessionWhere =
        sessionConditions.length > 0 ? { AND: sessionConditions } : {};

      const responses = await prisma.feedbackResponse.findMany({
        where: {
          session: sessionWhere,
        },
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
      });

      if (responses.length === 0) {
        return res.json({
          overall: { averageRating: 0, totalResponses: 0 },
          questionWise: [],
          trainerWise: [],
          subjectWise: [],
          batchWise: [],
          ratingDistribution: [],
        });
      }

      const allRatings: number[] = [];
      const questionMap: Record<
        string,
        { questionId: string; question: string; category: string; ratings: number[] }
      > = {};
      const trainerMap: Record<string, { trainerId: string; trainerName: string; ratings: number[] }> =
        {};
      const subjectMap: Record<string, { subject: string; ratings: number[] }> = {};
      const batchMap: Record<string, { batchId: string; batchName: string; ratings: number[] }> = {};
      const distributionMap: Record<
        string,
        { questionId: string; question: string; distribution: Record<number, number> }
      > = {};

      for (const resp of responses) {
        for (const answer of resp.answers) {
          allRatings.push(answer.rating);

          const qKey = answer.questionId;
          if (!questionMap[qKey]) {
            questionMap[qKey] = {
              questionId: answer.questionId,
              question: answer.question.question,
              category: answer.question.category,
              ratings: [],
            };
          }
          questionMap[qKey].ratings.push(answer.rating);

          if (!distributionMap[qKey]) {
            distributionMap[qKey] = {
              questionId: answer.questionId,
              question: answer.question.question,
              distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
            };
          }
          distributionMap[qKey].distribution[answer.rating]++;

          const trainer = resp.session.trainer;
          if (trainer?.user) {
            const tKey = trainer.user.id;
            if (!trainerMap[tKey]) {
              trainerMap[tKey] = {
                trainerId: trainer.user.id,
                trainerName: trainer.user.name,
                ratings: [],
              };
            }
            trainerMap[tKey].ratings.push(answer.rating);
          }

          const subKey = resp.session.subject || 'Unknown';
          if (!subjectMap[subKey]) {
            subjectMap[subKey] = { subject: subKey, ratings: [] };
          }
          subjectMap[subKey].ratings.push(answer.rating);

          for (const sb of resp.session.sessionBatches) {
            const bKey = sb.batch.id;
            if (!batchMap[bKey]) {
              batchMap[bKey] = {
                batchId: sb.batch.id,
                batchName: sb.batch.name,
                ratings: [],
              };
            }
            batchMap[bKey].ratings.push(answer.rating);
          }
        }
      }

      const avg = (ratings: number[]) =>
        ratings.length > 0
          ? Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 100) / 100
          : 0;

      const questionWise = Object.values(questionMap).map((q) => ({
        questionId: q.questionId,
        question: q.question,
        category: q.category,
        averageRating: avg(q.ratings),
        responseCount: q.ratings.length,
      }));

      const trainerWise = Object.values(trainerMap).map((t) => ({
        trainerId: t.trainerId,
        trainerName: t.trainerName,
        averageRating: avg(t.ratings),
        responseCount: t.ratings.length,
      }));

      const subjectWise = Object.values(subjectMap).map((s) => ({
        subject: s.subject,
        averageRating: avg(s.ratings),
        responseCount: s.ratings.length,
      }));

      const batchWise = Object.values(batchMap).map((b) => ({
        batchId: b.batchId,
        batchName: b.batchName,
        averageRating: avg(b.ratings),
        responseCount: b.ratings.length,
      }));

      const ratingDistribution = Object.values(distributionMap).map((d) => ({
        questionId: d.questionId,
        question: d.question,
        distribution: d.distribution,
        total: Object.values(d.distribution).reduce((s, v) => s + v, 0),
      }));

      res.json({
        overall: {
          averageRating: avg(allRatings),
          totalResponses: responses.length,
        },
        questionWise,
        trainerWise,
        subjectWise,
        batchWise,
        ratingDistribution,
      });
    } catch (error) {
      next(error);
    }
  }
);

// ─── GET /export ───────────────────────────────────────
router.get(
  '/export',
  authenticateToken,
  requirePermission('feedback.export'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new ForbiddenError();

      const {
        departmentId,
        academicYearId,
        batchId,
        startDate,
        endDate,
        format,
      } = req.query as Record<string, string | undefined>;

      const sessionConditions: Record<string, unknown>[] = [];
      if (departmentId) sessionConditions.push({ departmentId });
      if (academicYearId) sessionConditions.push({ academicYearId });
      if (batchId) sessionConditions.push({ sessionBatches: { some: { batchId } } });
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
        if (user.scopeType === 'DEPARTMENT' && user.scopeValue) {
          sessionConditions.push({ departmentId: user.scopeValue });
        }
        if (user.scopeType === 'BATCH' && user.scopeValue) {
          sessionConditions.push({ sessionBatches: { some: { batchId: user.scopeValue } } });
        }
      }

      const sessionWhere =
        sessionConditions.length > 0 ? { AND: sessionConditions } : {};

      const responses = await prisma.feedbackResponse.findMany({
        where: { session: sessionWhere },
        include: {
          answers: {
            include: {
              question: { select: { id: true, question: true } },
            },
          },
          session: {
            include: {
              trainer: { include: { user: { select: { id: true, name: true } } } },
              department: { select: { name: true } },
              academicYear: { select: { year: true, label: true } },
              sessionBatches: {
                include: { batch: { select: { id: true, name: true } } },
              },
            },
          },
        },
        orderBy: { submittedAt: 'desc' },
      });

      const groups: Record<
        string,
        {
          date: string;
          department: string;
          academicYear: string;
          batchName: string;
          subject: string;
          trainer: string;
          questionId: string;
          question: string;
          ratings: number[];
        }
      > = {};

      for (const resp of responses) {
        const dateStr = new Date(resp.session.date).toISOString().split('T')[0];
        const dept = resp.session.department.name;
        const ay = resp.session.academicYear.label || `Year ${resp.session.academicYear.year}`;
        const trainerName = resp.session.trainer?.user?.name || 'N/A';
        const subjectName = resp.session.subject || 'N/A';

        const batchNames = resp.session.sessionBatches.map((sb) => sb.batch.name);
        const batchNameStr = batchNames.length > 0 ? batchNames.join(', ') : 'N/A';

        for (const answer of resp.answers) {
          const key = `${dateStr}|${dept}|${ay}|${batchNameStr}|${subjectName}|${trainerName}|${answer.questionId}`;
          if (!groups[key]) {
            groups[key] = {
              date: dateStr,
              department: dept,
              academicYear: ay,
              batchName: batchNameStr,
              subject: subjectName,
              trainer: trainerName,
              questionId: answer.questionId,
              question: answer.question.question,
              ratings: [],
            };
          }
          groups[key].ratings.push(answer.rating);
        }
      }

      const rows = Object.values(groups).map((g) => ({
        Date: g.date,
        Department: g.department,
        'Academic Year': g.academicYear,
        Batch: g.batchName,
        Subject: g.subject,
        Trainer: g.trainer,
        Question: g.question,
        'Average Rating':
          Math.round((g.ratings.reduce((s, r) => s + r, 0) / g.ratings.length) * 100) / 100,
        'Response Count': g.ratings.length,
      }));

      const ext = (format || 'csv').toLowerCase();

      if (ext === 'xlsx') {
        const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ Date: '', Department: '', 'Academic Year': '', Batch: '', Subject: '', Trainer: '', Question: '', 'Average Rating': '', 'Response Count': '' }]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Feedback');
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader('Content-Disposition', 'attachment; filename=feedback.xlsx');
        res.send(Buffer.from(buf));
      } else {
        const csv = rows.length > 0
          ? stringify(rows, { header: true })
          : 'Date,Department,Academic Year,Batch,Subject,Trainer,Question,Average Rating,Response Count\n';
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=feedback.csv');
        res.send('\uFEFF' + csv);
      }
    } catch (error) {
      next(error);
    }
  }
);

export default router;

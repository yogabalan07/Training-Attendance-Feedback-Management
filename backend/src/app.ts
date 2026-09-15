import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { errorHandler } from './middleware/errorHandler';

import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import permissionRoutes from './routes/permissions';
import departmentRoutes from './routes/departments';
import academicYearRoutes from './routes/academic-years';
import batchRoutes from './routes/batches';
import studentRoutes from './routes/students';
import sessionRoutes from './routes/sessions';
import trainerRoutes from './routes/trainers';
import trainerAssignmentRoutes from './routes/trainer-assignments';
import attendanceRoutes from './routes/attendance';
import feedbackRoutes from './routes/feedback';
import reportRoutes from './routes/reports';
import auditLogRoutes from './routes/audit-logs';
import settingsRoutes from './routes/settings';

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
      : ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
  })
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use(cookieParser() as any);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10000,
  message: {
    success: false,
    error: {
      message: 'Too many authentication attempts, please try again later',
      statusCode: 429,
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth/login', authLimiter as any);

app.get('/api/health', (_req, res) => {
  res.json({ success: true, message: 'Smart Training Attendance API running' });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/permissions', permissionRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/academic-years', academicYearRoutes);
app.use('/api/batches', batchRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/trainers', trainerRoutes);
app.use('/api/trainer-assignments', trainerAssignmentRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/settings', settingsRoutes);

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: 'Route not found',
      statusCode: 404,
    },
  });
});

app.use(errorHandler);

export default app;
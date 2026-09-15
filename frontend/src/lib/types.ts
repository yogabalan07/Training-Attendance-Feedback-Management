export interface User {
  id: string;
  loginId: string;
  name: string;
  email: string;
  role: Role;
  departmentId?: string;
  department?: Department;
  isActive: boolean;
  permissions: Permission[];
  createdAt: string;
  updatedAt: string;
}

export interface Role {
  id: string;
  name: string;
  description?: string;
}

export interface Permission {
  id: string;
  name: string;
  module: string;
  action: string;
  description?: string;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AcademicYear {
  id: string;
  year: number;
  label?: string;
  departmentId: string;
  department?: Department;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Batch {
  id: string;
  name: string;
  code: string;
  departmentId: string;
  department?: Department;
  academicYearId: string;
  academicYear?: AcademicYear;
  semester: number;
  section?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Student {
  id: string;
  userId: string;
  user?: User;
  registerNumber: string;
  batchId: string;
  batch?: Batch;
  departmentId?: string;
  department?: Department;
  academicYearId?: string;
  academicYear?: AcademicYear;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Trainer {
  id: string;
  userId: string;
  user?: User;
  employeeId: string;
  specialization?: string;
  isExternal: boolean;
  departmentId?: string;
  department?: Department;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TrainerAssignment {
  id: string;
  trainerId: string;
  trainer?: Trainer;
  batchId: string;
  batch?: Batch;
  sessionId?: string;
  session?: Session;
  academicYearId: string;
  academicYear?: AcademicYear;
  subject?: string;
  startDate: string;
  endDate?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  title: string;
  description?: string;
  date: string;
  startTime: string;
  endTime: string;
  trainerId: string;
  trainer?: Trainer;
  batchId: string;
  batch?: Batch;
  academicYearId: string;
  academicYear?: AcademicYear;
  venue?: string;
  status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  attendanceSubmitted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SessionBatch {
  id: string;
  sessionId: string;
  batchId: string;
  session?: Session;
  batch?: Batch;
}

export interface Attendance {
  id: string;
  studentId: string;
  student?: Student;
  sessionId: string;
  session?: Session;
  status: 'present' | 'absent' | 'late' | 'excused';
  markedBy?: string;
  markedByUser?: User;
  submittedBy?: string;
  submittedByUser?: User;
  submittedAt?: string;
  remarks?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackQuestion {
  id: string;
  question: string;
  type: 'rating' | 'text' | 'multiple_choice';
  options?: string[];
  category?: string;
  isActive: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackResponse {
  id: string;
  studentId: string;
  student?: Student;
  sessionId: string;
  session?: Session;
  trainerId?: string;
  trainer?: Trainer;
  submittedAt: string;
  answers: FeedbackAnswer[];
  overallRating?: number;
  comments?: string;
  isAnonymous: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackAnswer {
  id: string;
  feedbackResponseId: string;
  questionId: string;
  question?: FeedbackQuestion;
  rating?: number;
  textAnswer?: string;
  selectedOption?: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  user?: User;
  action: string;
  entity: string;
  entityId?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

export interface SystemSetting {
  id: string;
  key: string;
  value: string;
  description?: string;
  category?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface LoginRequest {
  loginId: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface AttendanceSummary {
  totalSessions: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  percentage: number;
}

export interface DashboardStats {
  totalUsers?: number;
  totalStudents?: number;
  totalTrainers?: number;
  totalSessions?: number;
  activeSessions?: number;
  completedSessions?: number;
  attendanceRate?: number;
  feedbackCount?: number;
  recentActivity?: AuditLog[];
}

export interface AttendanceShortage {
  student: Student;
  attendancePercentage: number;
  totalSessions: number;
  attended: number;
  shortage: number;
}

export interface FeedbackAnalytics {
  totalResponses: number;
  averageRating: number;
  questionAnalytics: {
    questionId: string;
    question: string;
    averageRating?: number;
    responseCount: number;
    optionCounts?: Record<string, number>;
  }[];
  trainerRatings?: {
    trainerId: string;
    trainerName: string;
    averageRating: number;
    responseCount: number;
  }[];
}

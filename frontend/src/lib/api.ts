import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type {
  LoginRequest,
  LoginResponse,
  User,
  Student,
  Trainer,
  TrainerAssignment,
  Session,
  Attendance,
  FeedbackQuestion,
  FeedbackResponse,
  Department,
  AcademicYear,
  Batch,
  Permission,
  Role,
  AuditLog,
  SystemSetting,
  DashboardStats,
  AttendanceSummary,
  AttendanceShortage,
  FeedbackAnalytics,
  PaginatedResponse,
  PaginationParams,
  ApiResponse,
} from './types';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

function buildParams(params?: PaginationParams): Record<string, string | number | undefined> {
  if (!params) return {};
  return {
    page: params.page,
    limit: params.limit,
    search: params.search,
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
  };
}

export const authApi = {
  login: (data: LoginRequest) =>
    api.post<ApiResponse<LoginResponse>>('/auth/login', data).then((r) => r.data.data),
  logout: () => api.post<ApiResponse<null>>('/auth/logout').then((r) => r.data),
  getMe: () => api.get<ApiResponse<User>>('/auth/me').then((r) => r.data.data),
};

export const usersApi = {
  getAll: (params?: PaginationParams) =>
    api.get<ApiResponse<PaginatedResponse<User>>>('/users', { params: buildParams(params) }).then((r) => r.data.data),
  create: (data: Partial<User> & { password?: string }) =>
    api.post<ApiResponse<User>>('/users', data).then((r) => r.data.data),
  getById: (id: string) =>
    api.get<ApiResponse<User>>(`/users/${id}`).then((r) => r.data.data),
  update: (id: string, data: Partial<User>) =>
    api.patch<ApiResponse<User>>(`/users/${id}`, data).then((r) => r.data.data),
  toggleStatus: (id: string) =>
    api.patch<ApiResponse<User>>(`/users/${id}/toggle-status`).then((r) => r.data.data),
  getPermissions: (id: string) =>
    api.get<ApiResponse<Permission[]>>(`/users/${id}/permissions`).then((r) => r.data.data),
  updatePermissions: (id: string, permissions: string[]) =>
    api.patch<ApiResponse<Permission[]>>(`/users/${id}/permissions`, { permissions }).then((r) => r.data.data),
};

export const studentsApi = {
  getAll: (params?: PaginationParams) =>
    api.get<ApiResponse<PaginatedResponse<Student>>>('/students', { params: buildParams(params) }).then((r) => r.data.data),
  create: (data: Partial<Student>) =>
    api.post<ApiResponse<Student>>('/students', data).then((r) => r.data.data),
  getById: (id: string) =>
    api.get<ApiResponse<Student>>(`/students/${id}`).then((r) => r.data.data),
  update: (id: string, data: Partial<Student>) =>
    api.patch<ApiResponse<Student>>(`/students/${id}`, data).then((r) => r.data.data),
  getAttendance: (id: string, params?: PaginationParams) =>
    api.get<ApiResponse<PaginatedResponse<Attendance>>>(`/students/${id}/attendance`, { params: buildParams(params) }).then((r) => r.data.data),
  getAttendanceSummary: (id: string) =>
    api.get<ApiResponse<AttendanceSummary>>(`/students/${id}/attendance-summary`).then((r) => r.data.data),
};

export const trainersApi = {
  getAll: (params?: PaginationParams) =>
    api.get<ApiResponse<PaginatedResponse<Trainer>>>('/trainers', { params: buildParams(params) }).then((r) => r.data.data),
  create: (data: Partial<Trainer>) =>
    api.post<ApiResponse<Trainer>>('/trainers', data).then((r) => r.data.data),
  getById: (id: string) =>
    api.get<ApiResponse<Trainer>>(`/trainers/${id}`).then((r) => r.data.data),
  update: (id: string, data: Partial<Trainer>) =>
    api.patch<ApiResponse<Trainer>>(`/trainers/${id}`, data).then((r) => r.data.data),
};

export const trainerAssignmentsApi = {
  getAll: (params?: PaginationParams) =>
    api.get<ApiResponse<PaginatedResponse<TrainerAssignment>>>('/trainer-assignments', { params: buildParams(params) }).then((r) => r.data.data),
  create: (data: Partial<TrainerAssignment>) =>
    api.post<ApiResponse<TrainerAssignment>>('/trainer-assignments', data).then((r) => r.data.data),
  delete: (id: string) =>
    api.delete<ApiResponse<null>>(`/trainer-assignments/${id}`).then((r) => r.data),
  getMyAssignments: () =>
    api.get<ApiResponse<TrainerAssignment[]>>('/trainer-assignments/my-assignments').then((r) => r.data.data),
};

export const sessionsApi = {
  getAll: (params?: PaginationParams) =>
    api.get<ApiResponse<PaginatedResponse<Session>>>('/sessions', { params: buildParams(params) }).then((r) => r.data.data),
  create: (data: Partial<Session>) =>
    api.post<ApiResponse<Session>>('/sessions', data).then((r) => r.data.data),
  getById: (id: string) =>
    api.get<ApiResponse<Session>>(`/sessions/${id}`).then((r) => r.data.data),
  update: (id: string, data: Partial<Session>) =>
    api.patch<ApiResponse<Session>>(`/sessions/${id}`, data).then((r) => r.data.data),
  getAttendanceSummary: (id: string) =>
    api.get<ApiResponse<{ present: number; absent: number; late: number; excused: number; total: number }>>(`/sessions/${id}/attendance-summary`).then((r) => r.data.data),
};

export const attendanceApi = {
  getAll: (params?: PaginationParams & { sessionId?: string; studentId?: string; status?: string }) =>
    api.get<ApiResponse<PaginatedResponse<Attendance>>>('/attendance', { params: buildParams(params) }).then((r) => r.data.data),
  mark: (data: { sessionId: string; studentId: string; status: string; remarks?: string }) =>
    api.post<ApiResponse<Attendance>>('/attendance/mark', data).then((r) => r.data.data),
  bulkMark: (data: { sessionId: string; records: { studentId: string; status: string; remarks?: string }[] }) =>
    api.post<ApiResponse<Attendance[]>>('/attendance/bulk-mark', data).then((r) => r.data.data),
  submit: (sessionId: string) =>
    api.post<ApiResponse<null>>('/attendance/submit', { sessionId }).then((r) => r.data),
  update: (id: string, data: Partial<Attendance>) =>
    api.patch<ApiResponse<Attendance>>(`/attendance/${id}`, data).then((r) => r.data.data),
  export: (params?: { sessionId?: string; batchId?: string; startDate?: string; endDate?: string }) =>
    api.get('/attendance/export', { params, responseType: 'blob' as any }).then((r) => r.data),
  getShortage: (params?: PaginationParams) =>
    api.get<ApiResponse<PaginatedResponse<AttendanceShortage>>>('/attendance/shortage', { params: buildParams(params) }).then((r) => r.data.data),
  getSubmissionStatus: (params?: { startDate?: string; endDate?: string }) =>
    api.get<ApiResponse<any[]>>('/attendance/submission-status', { params }).then((r) => r.data.data),
};

export const feedbackApi = {
  getAll: (params?: PaginationParams) =>
    api.get<ApiResponse<PaginatedResponse<FeedbackResponse>>>('/feedback', { params: buildParams(params) }).then((r) => r.data.data),
  create: (data: { sessionId: string; answers: { questionId: string; rating?: number; textAnswer?: string; selectedOption?: string }[]; overallRating?: number; comments?: string; isAnonymous?: boolean }) =>
    api.post<ApiResponse<FeedbackResponse>>('/feedback', data).then((r) => r.data.data),
  getQuestions: () =>
    api.get<ApiResponse<FeedbackQuestion[]>>('/feedback/questions').then((r) => r.data.data),
  createQuestion: (data: Partial<FeedbackQuestion>) =>
    api.post<ApiResponse<FeedbackQuestion>>('/feedback/questions', data).then((r) => r.data.data),
  getAnalytics: (params?: { sessionId?: string; trainerId?: string }) =>
    api.get<ApiResponse<FeedbackAnalytics>>('/feedback/analytics', { params }).then((r) => r.data.data),
  export: (params?: { sessionId?: string; startDate?: string; endDate?: string }) =>
    api.get('/feedback/export', { params, responseType: 'blob' as any }).then((r) => r.data),
};

export const departmentsApi = {
  getAll: (params?: PaginationParams) =>
    api.get<ApiResponse<PaginatedResponse<Department>>>('/departments', { params: buildParams(params) }).then((r) => r.data.data),
  create: (data: Partial<Department>) =>
    api.post<ApiResponse<Department>>('/departments', data).then((r) => r.data.data),
  getById: (id: string) =>
    api.get<ApiResponse<Department>>(`/departments/${id}`).then((r) => r.data.data),
  update: (id: string, data: Partial<Department>) =>
    api.patch<ApiResponse<Department>>(`/departments/${id}`, data).then((r) => r.data.data),
};

export const academicYearsApi = {
  getAll: (params?: PaginationParams) =>
    api.get<ApiResponse<PaginatedResponse<AcademicYear>>>('/academic-years', { params: buildParams(params) }).then((r) => r.data.data),
  create: (data: Partial<AcademicYear>) =>
    api.post<ApiResponse<AcademicYear>>('/academic-years', data).then((r) => r.data.data),
  update: (id: string, data: Partial<AcademicYear>) =>
    api.patch<ApiResponse<AcademicYear>>(`/academic-years/${id}`, data).then((r) => r.data.data),
};

export const batchesApi = {
  getAll: (params?: PaginationParams) =>
    api.get<ApiResponse<PaginatedResponse<Batch>>>('/batches', { params: buildParams(params) }).then((r) => r.data.data),
  create: (data: Partial<Batch>) =>
    api.post<ApiResponse<Batch>>('/batches', data).then((r) => r.data.data),
  update: (id: string, data: Partial<Batch>) =>
    api.patch<ApiResponse<Batch>>(`/batches/${id}`, data).then((r) => r.data.data),
};

export const permissionsApi = {
  getAll: () =>
    api.get<ApiResponse<Permission[]>>('/permissions').then((r) => r.data.data),
  getRoles: () =>
    api.get<ApiResponse<Role[]>>('/permissions/roles').then((r) => r.data.data),
  updateRole: (roleId: string, permissions: string[]) =>
    api.patch<ApiResponse<Role>>(`/permissions/roles/${roleId}`, { permissions }).then((r) => r.data.data),
};

export const reportsApi = {
  getAttendance: (params?: { batchId?: string; startDate?: string; endDate?: string; trainerId?: string }) =>
    api.get<ApiResponse<any>>('/reports/attendance', { params }).then((r) => r.data.data),
  getFeedback: (params?: { batchId?: string; startDate?: string; endDate?: string; trainerId?: string }) =>
    api.get<ApiResponse<any>>('/reports/feedback', { params }).then((r) => r.data.data),
  getDashboard: () =>
    api.get<ApiResponse<DashboardStats>>('/reports/dashboard').then((r) => r.data.data),
};

export const auditLogsApi = {
  getAll: (params?: PaginationParams & { entity?: string; action?: string; userId?: string; startDate?: string; endDate?: string }) =>
    api.get<ApiResponse<PaginatedResponse<AuditLog>>>('/audit-logs', { params: buildParams(params) }).then((r) => r.data.data),
};

export const settingsApi = {
  getAll: () =>
    api.get<ApiResponse<SystemSetting[]>>('/settings').then((r) => r.data.data),
  update: (data: Partial<SystemSetting>[]) =>
    api.patch<ApiResponse<SystemSetting[]>>('/settings', { settings: data }).then((r) => r.data.data),
};

export default api;

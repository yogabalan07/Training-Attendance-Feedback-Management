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

// ─── Response-shape adapters ─────────────────────────────
// The backend returns raw shapes (e.g. `{ users, total, page, limit }`,
// `{ data, pagination }`, `{ department }`, ...). These helpers normalize
// them into the typed shapes consumed by the frontend.

type RecordParams = object;

function buildParams(params?: RecordParams): Record<string, string | number | boolean> {
  if (!params) return {};
  const out: Record<string, string | number | boolean> = {};
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      out[key] = value as string | number | boolean;
    }
  });
  return out;
}

function toPaginated<T>(
  items: T[],
  total: number,
  page: number,
  limit: number
): PaginatedResponse<T> {
  return {
    data: items,
    total,
    page,
    limit,
    totalPages: total > 0 ? Math.max(1, Math.ceil(total / limit)) : 0,
  };
}

function wrapList<T>(
  body: { data: T[]; total: number; page?: number; limit?: number }
): PaginatedResponse<T> {
  const page = body.page ?? 1;
  const limit = body.limit ?? Math.max(1, body.data.length || 1);
  return toPaginated(body.data, body.total, page, limit);
}

function mapSession(raw: any): Session {
  const batchId = raw.sessionBatches?.[0]?.batchId ?? raw.batchId;
  const subject = raw.subject ?? 'Session';
  return {
    ...raw,
    title: raw.title ?? (raw.topic ? `${subject} - ${raw.topic}` : `${subject} (${raw.sessionType})`),
    description: raw.description,
    venue: raw.venue,
    batchId,
    status: ((raw.status as string) || 'SCHEDULED').toLowerCase() as Session['status'],
    attendanceSubmitted: raw.attendanceStatus === 'SUBMITTED',
  };
}

function mapSessions(payload: any): Session[] {
  return Array.isArray(payload) ? payload.map(mapSession) : [];
}

function mapAttendance(raw: any): Attendance {
  const status = (raw.status ?? 'PENDING') as string;
  const mapped =
    status === 'PRESENT'
      ? 'present'
      : status === 'ABSENT'
        ? 'absent'
        : status === 'OD'
          ? 'excused'
          : 'pending';
  return {
    ...raw,
    status: mapped as Attendance['status'],
    session: raw.session ? mapSession(raw.session) : raw.session,
  };
}

function mapAttendances(payload: any): Attendance[] {
  return Array.isArray(payload) ? payload.map(mapAttendance) : [];
}

function mapAttendanceStatus(status: string): string {
  const normalized = (status ?? 'PENDING').toLowerCase();
  if (normalized === 'present') return 'PRESENT';
  if (normalized === 'absent') return 'ABSENT';
  if (normalized === 'od' || normalized === 'excused' || normalized === 'late') return 'OD';
  if (normalized === 'pending') return 'PENDING';
  return (status || 'PENDING').toUpperCase();
}

function mapSettingsList(payload: Record<string, string>): SystemSetting[] {
  return Object.entries(payload).map(([key, value]) => ({
    id: key,
    key,
    value,
    category: key.split('.')[0],
    description: undefined,
    createdAt: '',
    updatedAt: '',
  }));
}

export const authApi = {
  login: (data: LoginRequest) =>
    api.post<ApiResponse<LoginResponse>>('/auth/login', data).then((r) => r.data.data),
  logout: () => api.post<ApiResponse<null>>('/auth/logout').then((r) => r.data),
  getMe: () => api.get<ApiResponse<User>>('/auth/me').then((r) => r.data.data),
};

export const usersApi = {
  getAll: (params?: PaginationParams) =>
    api.get<any>('/users', { params: buildParams(params) }).then((r) =>
      wrapList<User>({
        data: r.data.users ?? [],
        total: r.data.total ?? 0,
        page: r.data.page,
        limit: r.data.limit,
      })
    ),
  create: (data: Partial<User> & { password?: string }) =>
    api.post<any>('/users', data).then((r) => r.data.user as User),
  getById: (id: string) =>
    api.get<any>(`/users/${id}`).then((r) => r.data.user as User),
  update: (id: string, data: Partial<User>) =>
    api.patch<any>(`/users/${id}`, data).then((r) => r.data.user as User),
  toggleStatus: (id: string) =>
    api.patch<any>(`/users/${id}/toggle-status`).then((r) => r.data.user as User),
  getPermissions: (id: string) =>
    api.get<any>(`/users/${id}/permissions`).then((r) => r.data),
  updatePermissions: (id: string, permissions: string[]) =>
    api.patch<any>(`/users/${id}/permissions`, { permissions }).then((r) => r.data),
};

export const studentsApi = {
  getAll: (params?: PaginationParams) =>
    api.get<any>('/students', { params: buildParams(params) }).then((r) =>
      wrapList<Student>({
        data: r.data.students ?? [],
        total: r.data.total ?? 0,
        page: r.data.page,
        limit: r.data.limit,
      })
    ),
  create: (data: Partial<Student>) =>
    api.post<any>('/students', data).then((r) => r.data as Student),
  getById: (id: string) =>
    api.get<any>(`/students/${id}`).then((r) => r.data as Student),
  update: (id: string, data: Partial<Student>) =>
    api.patch<any>(`/students/${id}`, data).then((r) => r.data as Student),
  getAttendance: (id: string, params?: PaginationParams) =>
    api.get<any>(`/students/${id}/attendance`, { params: buildParams(params) }).then((r) => {
      const items = mapAttendances(r.data);
      return toPaginated<Attendance>(items, items.length, 1, Math.max(1, items.length));
    }),
  getAttendanceSummary: (id: string) =>
    api
      .get<any>(`/students/${id}/attendance-summary`)
      .then(
        (r): AttendanceSummary => ({
          totalSessions: r.data.totalSessions ?? 0,
          present: r.data.present ?? 0,
          absent: r.data.absent ?? 0,
          late: 0,
          excused: r.data.od ?? 0,
          od: r.data.od ?? 0,
          pending: r.data.pending ?? 0,
          percentage: r.data.attendancePercentage ?? 0,
        })
      ),
};

export const trainersApi = {
  getAll: (params?: PaginationParams) =>
    api.get<any>('/trainers', { params: buildParams(params) }).then((r) =>
      wrapList<Trainer>({
        data: r.data.trainers ?? [],
        total: r.data.total ?? (r.data.trainers?.length ?? 0),
        page: 1,
        limit: Math.max(1, r.data.trainers?.length ?? 1),
      })
    ),
  create: (data: Partial<Trainer>) =>
    api.post<any>('/trainers', data).then((r) => r.data as Trainer),
  getById: (id: string) =>
    api.get<any>(`/trainers/${id}`).then((r) => r.data as Trainer),
  update: (id: string, data: Partial<Trainer>) =>
    api.patch<any>(`/trainers/${id}`, data).then((r) => r.data as Trainer),
};

export const trainerAssignmentsApi = {
  getAll: (params?: PaginationParams) =>
    api.get<any>('/trainer-assignments', { params: buildParams(params) }).then((r) =>
      wrapList<TrainerAssignment>({
        data: r.data.assignments ?? [],
        total: r.data.total ?? 0,
        page: r.data.page,
        limit: r.data.limit,
      })
    ),
  create: (data: Partial<TrainerAssignment>) =>
    api.post<any>('/trainer-assignments', data).then((r) => r.data as TrainerAssignment),
  delete: (id: string) =>
    api.delete<any>(`/trainer-assignments/${id}`).then(() => null),
  getMyAssignments: () =>
    api.get<any>('/trainer-assignments/my-assignments').then((r) => (r.data.assignments ?? []) as TrainerAssignment[]),
};

export const sessionsApi = {
  getAll: (params?: PaginationParams) =>
    api.get<any>('/sessions', { params: buildParams(params) }).then((r) =>
      wrapList<Session>({
        data: mapSessions(r.data.sessions),
        total: r.data.total ?? 0,
        page: r.data.page,
        limit: r.data.limit,
      })
    ),
  create: (data: Partial<Session>) =>
    api.post<any>('/sessions', data).then((r) => mapSession(r.data)),
  getById: (id: string) =>
    api.get<any>(`/sessions/${id}`).then((r) => mapSession(r.data)),
  update: (id: string, data: Partial<Session>) =>
    api.patch<any>(`/sessions/${id}`, data).then((r) => mapSession(r.data)),
  getAttendanceSummary: (id: string) =>
    api
      .get<any>(`/sessions/${id}/attendance-summary`)
      .then((r) => ({
        total: r.data.total ?? 0,
        present: r.data.present ?? 0,
        absent: r.data.absent ?? 0,
        late: 0,
        excused: r.data.od ?? 0,
      })),
};

export const attendanceApi = {
  getAll: (params?: PaginationParams & { sessionId?: string; studentId?: string; status?: string }) =>
    api.get<any>('/attendance', { params: buildParams(params) }).then((r) =>
      toPaginated<Attendance>(
        mapAttendances(r.data.data ?? []),
        r.data.pagination?.total ?? 0,
        r.data.pagination?.page ?? 1,
        r.data.pagination?.limit ?? 50
      )
    ),
  mark: (data: { sessionId: string; studentId: string; status: string; remarks?: string }) =>
    api.post<any>(`/attendance/mark`, {
      sessionId: data.sessionId,
      studentId: data.studentId,
      status: mapAttendanceStatus(data.status),
    }).then((r) => mapAttendance(r.data)),
  bulkMark: (data: { sessionId: string; batchId?: string; records?: { studentId: string; status: string; remarks?: string }[] }) =>
    api.post<any>(`/attendance/bulk-mark`, {
      sessionId: data.sessionId,
      batchId: data.batchId,
      attendances: (data.records ?? []).map((r) => ({
        studentId: r.studentId,
        status: mapAttendanceStatus(r.status),
      })),
    }).then((r) => r.data.data as { studentId: string; status: string }[]),
  submit: (sessionId: string, batchId?: string) =>
    api.post<any>(`/attendance/submit`, { sessionId, batchId }).then((r) => r.data),
  update: (id: string, data: Partial<Attendance>) =>
    api.patch<any>(`/attendance/${id}`, {
      status: data.status ? mapAttendanceStatus(data.status) : undefined,
      reason: data.remarks ?? null,
    }).then((r) => mapAttendance(r.data)),
  export: (params?: { sessionId?: string; batchId?: string; startDate?: string; endDate?: string }) =>
    api.get('/attendance/export', { params, responseType: 'blob' as any }).then((r) => r.data),
  getShortage: (params?: PaginationParams) =>
    api.get<any>('/attendance/shortage', { params: buildParams(params) }).then((r) =>
      toPaginated<AttendanceShortage>(
        r.data.data ?? [],
        r.data.totalShortage ?? 0,
        1,
        Math.max(1, r.data.data?.length ?? 1)
      )
    ),
  getSubmissionStatus: (params?: { startDate?: string; endDate?: string }) =>
    api.get<any>('/attendance/submission-status', { params: buildParams(params) }).then((r) => (r.data.data ?? []) as any[]),
};

export const feedbackApi = {
  getAll: (params?: PaginationParams) =>
    api.get<any>('/feedback', { params: buildParams(params) }).then((r) =>
      toPaginated<FeedbackResponse>(
        r.data.data ?? [],
        r.data.pagination?.total ?? 0,
        r.data.pagination?.page ?? 1,
        r.data.pagination?.limit ?? 20
      )
    ),
  create: (data: { sessionId: string; answers: { questionId: string; rating?: number; textAnswer?: string; selectedOption?: string }[]; overallRating?: number; comments?: string; isAnonymous?: boolean }) =>
    api.post<any>('/feedback', data).then((r) => r.data as FeedbackResponse),
  getQuestions: () =>
    api.get<any>('/feedback/questions').then((r) => (r.data.data ?? []) as FeedbackQuestion[]),
  createQuestion: (data: Partial<FeedbackQuestion>) =>
    api.post<any>('/feedback/questions', data).then((r) => r.data as FeedbackQuestion),
  getAnalytics: (params?: { sessionId?: string; trainerId?: string }) =>
    api.get<any>('/feedback/analytics', { params }).then((r) => r.data as FeedbackAnalytics),
  export: (params?: { sessionId?: string; startDate?: string; endDate?: string }) =>
    api.get('/feedback/export', { params, responseType: 'blob' as any }).then((r) => r.data),
};

export const departmentsApi = {
  getAll: (params?: PaginationParams) =>
    api.get<any>('/departments', { params: buildParams(params) }).then((r) =>
      wrapList<Department>({
        data: r.data.departments ?? [],
        total: r.data.departments?.length ?? 0,
        page: 1,
        limit: Math.max(1, r.data.departments?.length ?? 1),
      })
    ),
  create: (data: Partial<Department>) =>
    api.post<any>('/departments', data).then((r) => r.data.department as Department),
  getById: (id: string) =>
    api.get<any>(`/departments/${id}`).then((r) => r.data.department as Department),
  update: (id: string, data: Partial<Department>) =>
    api.patch<any>(`/departments/${id}`, data).then((r) => r.data.department as Department),
};

export const academicYearsApi = {
  getAll: (params?: PaginationParams) =>
    api.get<any>('/academic-years', { params: buildParams(params) }).then((r) =>
      wrapList<AcademicYear>({
        data: r.data.academicYears ?? [],
        total: r.data.academicYears?.length ?? 0,
        page: 1,
        limit: Math.max(1, r.data.academicYears?.length ?? 1),
      })
    ),
  create: (data: Partial<AcademicYear>) =>
    api.post<any>('/academic-years', data).then((r) => r.data.academicYear as AcademicYear),
  update: (id: string, data: Partial<AcademicYear>) =>
    api.patch<any>(`/academic-years/${id}`, data).then((r) => r.data.academicYear as AcademicYear),
};

export const batchesApi = {
  getAll: (params?: PaginationParams) =>
    api.get<any>('/batches', { params: buildParams(params) }).then((r) =>
      wrapList<Batch>({
        data: r.data.batches ?? [],
        total: r.data.batches?.length ?? 0,
        page: 1,
        limit: Math.max(1, r.data.batches?.length ?? 1),
      })
    ),
  create: (data: Partial<Batch>) =>
    api.post<any>('/batches', data).then((r) => r.data.batch as Batch),
  update: (id: string, data: Partial<Batch>) =>
    api.patch<any>(`/batches/${id}`, data).then((r) => r.data.batch as Batch),
};

export const permissionsApi = {
  getAll: () =>
    api
      .get<any>('/permissions')
      .then(
        (r): Permission[] => {
          const grouped = r.data.permissions ?? {};
          return Object.entries(grouped).flatMap(([category, perms]) =>
            (perms as any[]).map((p) => ({
              id: p.id,
              name: p.name,
              module: category,
              action: p.displayName ?? p.name.split('.').slice(1).join('.'),
              description: p.description,
            }))
          );
        }
      ),
  getRoles: () =>
    api.get<any>('/permissions/roles').then((r) => (r.data.roles ?? []) as Role[]),
  updateRole: (roleId: string, permissionIds: string[]) =>
    api.patch<any>(`/permissions/roles/${roleId}`, { permissionIds }).then((r) => r.data.role),
};

export const reportsApi = {
  getAttendance: (params?: { batchId?: string; startDate?: string; endDate?: string; trainerId?: string }) =>
    api.get<any>('/reports/attendance', { params: buildParams(params) }).then((r) => r.data),
  getFeedback: (params?: { batchId?: string; startDate?: string; endDate?: string; trainerId?: string }) =>
    api.get<any>('/reports/feedback', { params: buildParams(params) }).then((r) => r.data),
  getDashboard: () =>
    api.get<any>('/reports/dashboard').then((r) => r.data as DashboardStats),
};

export const auditLogsApi = {
  getAll: (params?: PaginationParams & { entity?: string; action?: string; userId?: string; startDate?: string; endDate?: string }) =>
    api.get<any>('/audit-logs', { params: buildParams(params) }).then((r) =>
      wrapList<AuditLog>({
        data: r.data.logs ?? [],
        total: r.data.total ?? 0,
        page: r.data.page,
        limit: r.data.limit,
      })
    ),
};

export const settingsApi = {
  getAll: () =>
    api.get<any>('/settings').then((r) => mapSettingsList(r.data.settings ?? {})),
  update: (data: Partial<SystemSetting>[]) =>
    api.patch<any>('/settings', { settings: data }).then((r) => mapSettingsList(r.data.settings ?? {})),
};

export default api;
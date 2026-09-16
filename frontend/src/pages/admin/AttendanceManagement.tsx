import { useState, useEffect, useCallback } from 'react';
import { attendanceApi, sessionsApi } from '../../lib/api';
import type { Attendance, Session, PaginatedResponse } from '../../lib/types';

export default function AttendanceManagement() {
  const [data, setData] = useState<PaginatedResponse<Attendance> | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [sessionFilter, setSessionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, any> = { page, limit: 50 };
      if (sessionFilter) params.sessionId = sessionFilter;
      if (statusFilter) params.status = statusFilter;
      const res = await attendanceApi.getAll(params);
      setData(res);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to load attendance');
    } finally {
      setLoading(false);
    }
  }, [page, sessionFilter, statusFilter]);

  useEffect(() => {
    sessionsApi.getAll({ limit: 100 }).then((r) => setSessions(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleExport = async () => {
    try {
      const params: Record<string, string> = {};
      if (sessionFilter) params.sessionId = sessionFilter;
      const blob = await attendanceApi.export(params);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'attendance.csv';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      setError('Failed to export');
    }
  };

  const statusBadge = (status: string) => {
    const cls: Record<string, string> = { present: 'badge-success', absent: 'badge-danger', late: 'badge-warning', excused: 'badge-info' };
    return <span className={`badge ${cls[status] || ''}`}>{status}</span>;
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Attendance Management</h2>
          <p className="page-subtitle">View and manage attendance records</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" onClick={handleExport}>Export CSV</button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="card-header" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <select value={sessionFilter} onChange={(e) => { setSessionFilter(e.target.value); setPage(1); }}>
            <option value="">All Sessions</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {new Date(s.date).toLocaleDateString()} - {s.title}
              </option>
            ))}
          </select>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">All Statuses</option>
            <option value="present">Present</option>
            <option value="absent">Absent</option>
            <option value="late">Late</option>
            <option value="excused">Excused</option>
          </select>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div className="loading-screen"><div className="spinner" /><span>Loading...</span></div>
          ) : !data?.data.length ? (
            <div className="empty-state">No attendance records found</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Session</th>
                  <th>Student</th>
                  <th>Enrollment No</th>
                  <th>Batch</th>
                  <th>Status</th>
                  <th>Marked By</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((a) => (
                  <tr key={a.id}>
                    <td>{a.session?.date ? new Date(a.session.date).toLocaleDateString() : '-'}</td>
                    <td>{a.session?.title || '-'}</td>
                    <td>{a.student?.user?.name ?? (a.student?.name || '-')}</td>
                    <td>{a.student?.registerNumber || '-'}</td>
                    <td>{a.student?.batch?.name || '-'}</td>
                    <td>{statusBadge(a.status)}</td>
                    <td>{a.markedByUser?.name || '-'}</td>
                    <td>
                      <span className={`badge ${a.submittedAt ? 'badge-success' : 'badge-warning'}`}>
                        {a.submittedAt ? 'Submitted' : 'Pending'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {data && data.totalPages > 1 && (
          <div className="card-header" style={{ justifyContent: 'center', gap: 8 }}>
            <button className="btn btn-sm btn-outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Page {page} of {data.totalPages}</span>
            <button className="btn btn-sm btn-outline" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        )}
      </div>
    </div>
  );
}

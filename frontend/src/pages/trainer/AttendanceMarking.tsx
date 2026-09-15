import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { sessionsApi, attendanceApi, studentsApi } from '../../lib/api';
import type { Session, Attendance } from '../../lib/types';

interface AttendanceRecord {
  studentId: string;
  studentName: string;
  registerNumber: string;
  batchName: string;
  status: 'present' | 'absent' | 'late' | 'excused' | 'pending';
  remarks: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; text: string }> = {
  present: { label: 'PRESENT', color: 'var(--success)', bg: 'var(--success-light)', text: '#065f46' },
  absent: { label: 'ABSENT', color: 'var(--danger)', bg: 'var(--danger-light)', text: '#991b1b' },
  late: { label: 'OD', color: 'var(--info)', bg: 'var(--info-light)', text: '#1e40af' },
  excused: { label: 'OD', color: 'var(--info)', bg: 'var(--info-light)', text: '#1e40af' },
  pending: { label: 'PENDING', color: 'var(--warning)', bg: 'var(--warning-light)', text: '#92400e' },
};

export default function AttendanceMarking() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadSessionAndStudents = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const sessionData = await sessionsApi.getById(sessionId);
      setSession(sessionData);

      const studentsData = await studentsApi.getAll({ limit: 200 });

      let sessionStudents = studentsData.data.filter((s) => s.batchId === sessionData.batchId);

      const existingAttendance = await attendanceApi.getAll({ sessionId, limit: 200 });
      const attendanceMap = new Map<string, Attendance>();
      existingAttendance.data.forEach((a) => attendanceMap.set(a.studentId, a));

      const initialRecords: AttendanceRecord[] = sessionStudents.map((student) => {
        const existing = attendanceMap.get(student.id);
        return {
          studentId: student.id,
          studentName: student.user?.name ?? 'Unknown',
          registerNumber: student.registerNumber,
          batchName: student.batch?.name ?? '-',
          status: existing
            ? (existing.status as AttendanceRecord['status'])
            : 'pending',
          remarks: existing?.remarks ?? '',
        };
      });

      initialRecords.sort((a, b) => a.registerNumber.localeCompare(b.registerNumber));
      setRecords(initialRecords);
    } catch (err) {
      console.error('Failed to load session:', err);
      setError('Failed to load session data');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadSessionAndStudents();
  }, [loadSessionAndStudents]);

  const updateStatus = (studentId: string, status: AttendanceRecord['status']) => {
    setRecords((prev) =>
      prev.map((r) => (r.studentId === studentId ? { ...r, status } : r))
    );
  };

  const updateRemarks = (studentId: string, remarks: string) => {
    setRecords((prev) =>
      prev.map((r) => (r.studentId === studentId ? { ...r, remarks } : r))
    );
  };

  const markAllPresent = () => {
    setRecords((prev) => prev.map((r) => ({ ...r, status: 'present' as const })));
  };

  const markAllAbsent = () => {
    setRecords((prev) => prev.map((r) => ({ ...r, status: 'absent' as const })));
  };

  const resetAll = () => {
    setRecords((prev) => prev.map((r) => ({ ...r, status: 'pending' as const, remarks: '' })));
  };

  const handleSaveDraft = async () => {
    if (!sessionId) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        sessionId,
        records: records
          .filter((r) => r.status !== 'pending')
          .map((r) => ({
            studentId: r.studentId,
            status: r.status === 'late' ? 'excused' : r.status,
            remarks: r.remarks || undefined,
          })),
      };
      await attendanceApi.bulkMark(payload);
      setSuccess('Attendance saved as draft');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save attendance');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!sessionId) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        sessionId,
        records: records
          .filter((r) => r.status !== 'pending')
          .map((r) => ({
            studentId: r.studentId,
            status: r.status === 'late' ? 'excused' : r.status,
            remarks: r.remarks || undefined,
          })),
      };
      await attendanceApi.bulkMark(payload);
      await attendanceApi.submit(sessionId);
      setSuccess('Attendance submitted successfully');
      setShowConfirm(false);
      setTimeout(() => navigate(-1), 1500);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to submit attendance');
    } finally {
      setSaving(false);
    }
  };

  const pendingCount = records.filter((r) => r.status === 'pending').length;
  const markedCount = records.filter((r) => r.status !== 'pending').length;

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Loading attendance data...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="card">
        <div className="card-body">
          <p className="empty-state">Session not found</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h2>Mark Attendance</h2>
        <p className="page-subtitle">{session.title}</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
            <div>
              <strong>Date:</strong> {new Date(session.date).toLocaleDateString()}
            </div>
            <div>
              <strong>Time:</strong> {session.startTime} - {session.endTime}
            </div>
            <div>
              <strong>Batch:</strong> {session.batch?.name ?? '-'}
            </div>
            <div>
              <strong>Venue:</strong> {session.venue ?? '-'}
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-header">
          <h3>
            Students ({records.length}) - Marked: {markedCount} | Pending: {pendingCount}
          </h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-sm btn-success" onClick={markAllPresent}>
              All Present
            </button>
            <button className="btn btn-sm btn-danger" onClick={markAllAbsent}>
              All Absent
            </button>
            <button className="btn btn-sm btn-outline" onClick={resetAll}>
              Reset All
            </button>
          </div>
        </div>
        <div className="card-body">
          {records.length === 0 ? (
            <p className="empty-state">No students found for this batch</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Register Number</th>
                  <th>Name</th>
                  <th>Batch</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr
                    key={record.studentId}
                    style={{
                      background:
                        record.status !== 'pending'
                          ? `${STATUS_CONFIG[record.status].bg}40`
                          : undefined,
                    }}
                  >
                    <td style={{ fontWeight: 500 }}>{record.registerNumber}</td>
                    <td>{record.studentName}</td>
                    <td>{record.batchName}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        {(Object.keys(STATUS_CONFIG) as Array<AttendanceRecord['status']>).map((key) => {
                          const config = STATUS_CONFIG[key];
                          const isActive = record.status === key;
                          return (
                            <button
                              key={key}
                              onClick={() => updateStatus(record.studentId, key)}
                              style={{
                                padding: '4px 12px',
                                borderRadius: '9999px',
                                border: `2px solid ${config.color}`,
                                background: isActive ? config.color : 'transparent',
                                color: isActive ? '#fff' : config.color,
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                              }}
                            >
                              {config.label}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                    <td>
                      <input
                        type="text"
                        value={record.remarks}
                        onChange={(e) => updateRemarks(record.studentId, e.target.value)}
                        placeholder="Optional remark"
                        style={{
                          width: '120px',
                          padding: '4px 8px',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius)',
                          fontSize: '0.8rem',
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
        <button className="btn btn-secondary" onClick={() => navigate(-1)}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={handleSaveDraft} disabled={saving}>
          {saving ? 'Saving...' : 'Save Draft'}
        </button>
        <button
          className="btn btn-success"
          onClick={() => setShowConfirm(true)}
          disabled={saving || pendingCount === records.length}
        >
          Submit Attendance
        </button>
      </div>

      {showConfirm && (
        <div className="modal-overlay" onClick={() => setShowConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Confirm Submission</h3>
              <button className="modal-close" onClick={() => setShowConfirm(false)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to submit the attendance?</p>
              <div style={{ marginTop: '12px' }}>
                <p>
                  <strong>Session:</strong> {session.title}
                </p>
                <p>
                  <strong>Total Students:</strong> {records.length}
                </p>
                <p>
                  <strong>Present:</strong>{' '}
                  {records.filter((r) => r.status === 'present').length}
                </p>
                <p>
                  <strong>Absent:</strong>{' '}
                  {records.filter((r) => r.status === 'absent').length}
                </p>
                <p>
                  <strong>OD:</strong> {records.filter((r) => r.status === 'late').length}
                </p>
                {pendingCount > 0 && (
                  <p style={{ color: 'var(--danger)' }}>
                    <strong>Unmarked:</strong> {pendingCount} students will be marked as absent
                  </p>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowConfirm(false)}>
                Cancel
              </button>
              <button className="btn btn-success" onClick={handleSubmit} disabled={saving}>
                {saving ? 'Submitting...' : 'Confirm Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

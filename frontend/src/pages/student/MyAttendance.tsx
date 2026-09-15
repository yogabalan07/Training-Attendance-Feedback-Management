import { useEffect, useState } from 'react';
import { studentsApi, attendanceApi } from '../../lib/api';
import type { Attendance, AttendanceSummary } from '../../lib/types';

export default function MyAttendance() {
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const studentData = await studentsApi.getAll({ limit: 1 });
      if (!studentData.data || studentData.data.length === 0) return;

      const student = studentData.data[0];

      const [attendanceData, summaryData] = await Promise.allSettled([
        attendanceApi.getAll({ studentId: student.id, limit: 200 }),
        studentsApi.getAttendanceSummary(student.id),
      ]);

      if (attendanceData.status === 'fulfilled') {
        const sorted = attendanceData.value.data.sort(
          (a, b) => new Date(b.session?.date ?? 0).getTime() - new Date(a.session?.date ?? 0).getTime()
        );
        setAttendance(sorted);
      }
      if (summaryData.status === 'fulfilled') setSummary(summaryData.value);
    } catch (error) {
      console.error('Failed to load attendance:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Loading attendance...</p>
      </div>
    );
  }

  const percentage = summary?.percentage ?? 0;

  return (
    <div>
      <div className="page-header">
        <h2>My Attendance</h2>
        <p className="page-subtitle">View your attendance records</p>
      </div>

      {summary && (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon" style={{ background: 'var(--primary-light)' }}>📋</div>
              <div className="stat-content">
                <h3>{summary.totalSessions}</h3>
                <p>Total Sessions</p>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon" style={{ background: 'var(--success-light)' }}>✅</div>
              <div className="stat-content">
                <h3>{summary.present}</h3>
                <p>Present</p>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon" style={{ background: 'var(--danger-light)' }}>❌</div>
              <div className="stat-content">
                <h3>{summary.absent}</h3>
                <p>Absent</p>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon" style={{ background: 'var(--info-light)' }}>🔵</div>
              <div className="stat-content">
                <h3>{summary.excused}</h3>
                <p>OD</p>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon" style={{ background: percentage < 75 ? 'var(--danger-light)' : 'var(--success-light)' }}>📊</div>
              <div className="stat-content">
                <h3 style={{ color: percentage < 75 ? 'var(--danger)' : 'inherit' }}>
                  {percentage.toFixed(1)}%
                </h3>
                <p>Percentage</p>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: '20px' }}>
            <div className="card-header">
              <h3>Attendance Progress</h3>
            </div>
            <div className="card-body">
              <div className="progress-bar-container">
                <div
                  className="progress-bar"
                  style={{
                    width: `${percentage}%`,
                    background: percentage < 75 ? 'var(--danger)' : 'var(--success)',
                  }}
                >
                  {percentage.toFixed(1)}%
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="card">
        <div className="card-header">
          <h3>Attendance Records</h3>
        </div>
        <div className="card-body">
          {attendance.length === 0 ? (
            <p className="empty-state">No attendance records found</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Session Type</th>
                  <th>Subject</th>
                  <th>Status</th>
                  <th>Session Status</th>
                </tr>
              </thead>
              <tbody>
                {attendance.map((record) => (
                  <tr key={record.id}>
                    <td>
                      {record.session?.date
                        ? new Date(record.session.date).toLocaleDateString()
                        : '-'}
                    </td>
                    <td>{record.session?.title ?? '-'}</td>
                    <td>{record.session?.description ?? '-'}</td>
                    <td>
                      <span className={`badge badge-${record.status}`}>
                        {record.status}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-${record.session?.status ?? 'scheduled'}`}>
                        {record.session?.status ?? 'unknown'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

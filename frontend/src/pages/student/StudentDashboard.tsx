import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { sessionsApi, studentsApi } from '../../lib/api';
import type { Session, AttendanceSummary } from '../../lib/types';

export default function StudentDashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [recentSessions, setRecentSessions] = useState<Session[]>([]);
  const [upcomingSessions, setUpcomingSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const studentData = await studentsApi.getAll({ limit: 1 });
      if (studentData.data && studentData.data.length > 0) {
        const id = studentData.data[0].id;

        const [summaryData, attendanceData] = await Promise.allSettled([
          studentsApi.getAttendanceSummary(id),
          studentsApi.getAttendance(id, { limit: 50 }),
        ]);

        if (summaryData.status === 'fulfilled') setSummary(summaryData.value);

        if (attendanceData.status === 'fulfilled') {
          const sessionsFromAttendance = attendanceData.value.data
            .filter((a) => a.session)
            .map((a) => a.session!);
          setRecentSessions(sessionsFromAttendance.slice(0, 5));
        }

        const sessionsData = await sessionsApi.getAll({ limit: 10, sortBy: 'date', sortOrder: 'desc' });
        const now = new Date();
        const upcoming = sessionsData.data.filter(
          (s) => new Date(s.date) >= now && s.status === 'scheduled'
        );
        setUpcomingSessions(upcoming.slice(0, 5));
      }
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Loading dashboard...</p>
      </div>
    );
  }

  const percentage = summary?.percentage ?? 0;
  const hasShortage = percentage < 75;

  return (
    <div>
      <div className="page-header">
        <h2>Student Dashboard</h2>
        <p className="page-subtitle">Welcome back, {user?.name}</p>
      </div>

      {hasShortage && (
        <div className="alert alert-warning" style={{ marginBottom: '20px' }}>
          ⚠ Your attendance is below 75% ({percentage.toFixed(1)}%). Please attend upcoming sessions to avoid shortage.
        </div>
      )}

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--primary-light)' }}>📋</div>
          <div className="stat-content">
            <h3>{summary?.totalSessions ?? 0}</h3>
            <p>Total Sessions</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--success-light)' }}>✅</div>
          <div className="stat-content">
            <h3>{summary?.present ?? 0}</h3>
            <p>Present</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--danger-light)' }}>❌</div>
          <div className="stat-content">
            <h3>{summary?.absent ?? 0}</h3>
            <p>Absent</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--warning-light)' }}>⏳</div>
          <div className="stat-content">
            <h3>{summary?.late ?? 0}</h3>
            <p>Pending/Late</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--info-light)' }}>🔵</div>
          <div className="stat-content">
            <h3>{summary?.excused ?? 0}</h3>
            <p>OD</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: hasShortage ? 'var(--danger-light)' : 'var(--success-light)' }}>📊</div>
          <div className="stat-content">
            <h3 style={{ color: hasShortage ? 'var(--danger)' : 'inherit' }}>{percentage.toFixed(1)}%</h3>
            <p>Attendance</p>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-header">
          <h3>Attendance Progress</h3>
        </div>
        <div className="card-body">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div className="progress-bar-container" style={{ flex: 1 }}>
              <div
                className="progress-bar"
                style={{
                  width: `${percentage}%`,
                  background: hasShortage ? 'var(--danger)' : 'var(--success)',
                }}
              >
                {percentage.toFixed(1)}%
              </div>
            </div>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              {hasShortage ? 'Below 75% - Shortage' : 'Good Standing'}
            </span>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div className="card">
          <div className="card-header">
            <h3>Recent Sessions</h3>
          </div>
          <div className="card-body">
            {recentSessions.length === 0 ? (
              <p className="empty-state">No recent sessions</p>
            ) : (
              <div className="activity-list">
                {recentSessions.map((session) => (
                  <div key={session.id} className="activity-item">
                    <span className="activity-action">{session.title}</span>
                    <span className="activity-entity">
                      {new Date(session.date).toLocaleDateString()}
                    </span>
                    <span className={`badge badge-${session.status}`}>{session.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Upcoming Sessions</h3>
          </div>
          <div className="card-body">
            {upcomingSessions.length === 0 ? (
              <p className="empty-state">No upcoming sessions</p>
            ) : (
              <div className="activity-list">
                {upcomingSessions.map((session) => (
                  <div key={session.id} className="activity-item">
                    <span className="activity-action">{session.title}</span>
                    <span className="activity-entity">
                      {new Date(session.date).toLocaleDateString()}
                    </span>
                    <span className="activity-time">
                      {session.startTime}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

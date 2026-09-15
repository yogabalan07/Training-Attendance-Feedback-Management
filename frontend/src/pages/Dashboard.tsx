import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { reportsApi, sessionsApi, trainerAssignmentsApi, studentsApi } from '../lib/api';
import type { DashboardStats, Session, AttendanceSummary } from '../lib/types';

export default function Dashboard() {
  const { user, hasRole } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [attendanceSummary, setAttendanceSummary] = useState<AttendanceSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      if (hasRole('ADMIN')) {
        const dashboardData = await reportsApi.getDashboard();
        setStats(dashboardData);
      } else if (hasRole('INTERNAL_TRAINER') || hasRole('EXTERNAL_TRAINER')) {
        await trainerAssignmentsApi.getMyAssignments();
        const sessionsData = await sessionsApi.getAll({ limit: 10 });
        setSessions(sessionsData.data || []);
      } else if (hasRole('STUDENT')) {
        const me = await studentsApi.getAll({ limit: 1 });
        if (me.data && me.data.length > 0) {
          const summary = await studentsApi.getAttendanceSummary(me.data[0].id);
          setAttendanceSummary(summary);
        }
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

  return (
    <div className="dashboard">
      <div className="page-header">
        <h2>Welcome, {user?.name}</h2>
        <p className="page-subtitle">{user?.role?.name?.replace('_', ' ')} Dashboard</p>
      </div>

      {hasRole('ADMIN') && stats && (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon">👤</div>
              <div className="stat-content">
                <h3>{stats.totalUsers || 0}</h3>
                <p>Total Users</p>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">🎓</div>
              <div className="stat-content">
                <h3>{stats.totalStudents || 0}</h3>
                <p>Students</p>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">📋</div>
              <div className="stat-content">
                <h3>{stats.totalSessions || 0}</h3>
                <p>Sessions</p>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">✅</div>
              <div className="stat-content">
                <h3>{stats.attendanceRate ? `${stats.attendanceRate.toFixed(1)}%` : '0%'}</h3>
                <p>Attendance Rate</p>
              </div>
            </div>
          </div>

          {stats.recentActivity && stats.recentActivity.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h3>Recent Activity</h3>
              </div>
              <div className="card-body">
                <div className="activity-list">
                  {stats.recentActivity.map((activity) => (
                    <div key={activity.id} className="activity-item">
                      <span className="activity-action">{activity.action}</span>
                      <span className="activity-entity">{activity.entity}</span>
                      <span className="activity-time">
                        {new Date(activity.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {(hasRole('INTERNAL_TRAINER') || hasRole('EXTERNAL_TRAINER')) && (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon">📋</div>
              <div className="stat-content">
                <h3>{sessions.length}</h3>
                <p>Upcoming Sessions</p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3>Recent Sessions</h3>
            </div>
            <div className="card-body">
              {sessions.length === 0 ? (
                <p className="empty-state">No sessions found</p>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((session) => (
                      <tr key={session.id}>
                        <td>{session.title}</td>
                        <td>{new Date(session.date).toLocaleDateString()}</td>
                        <td>
                          {session.startTime} - {session.endTime}
                        </td>
                        <td>
                          <span className={`badge badge-${session.status}`}>
                            {session.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      {hasRole('STUDENT') && (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon">✅</div>
              <div className="stat-content">
                <h3>{attendanceSummary ? `${attendanceSummary.percentage.toFixed(1)}%` : '0%'}</h3>
                <p>Attendance</p>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">📋</div>
              <div className="stat-content">
                <h3>{attendanceSummary?.totalSessions || 0}</h3>
                <p>Total Sessions</p>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">✅</div>
              <div className="stat-content">
                <h3>{attendanceSummary?.present || 0}</h3>
                <p>Present</p>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">❌</div>
              <div className="stat-content">
                <h3>{attendanceSummary?.absent || 0}</h3>
                <p>Absent</p>
              </div>
            </div>
          </div>

          {attendanceSummary && (
            <div className="card">
              <div className="card-header">
                <h3>Attendance Overview</h3>
              </div>
              <div className="card-body">
                <div className="progress-bar-container">
                  <div className="progress-bar" style={{ width: `${attendanceSummary.percentage}%` }}>
                    {attendanceSummary.percentage.toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {hasRole('CUSTOM_STAFF') && (
        <div className="card">
          <div className="card-header">
            <h3>Dashboard</h3>
          </div>
          <div className="card-body">
            <p className="empty-state">Welcome to the system. Use the navigation menu to access features based on your permissions.</p>
          </div>
        </div>
      )}
    </div>
  );
}

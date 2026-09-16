import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  sessionsApi,
  trainerAssignmentsApi,
  feedbackApi,
} from '../../lib/api';
import type { Session, TrainerAssignment, FeedbackAnalytics } from '../../lib/types';

export default function TrainerDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [assignments, setAssignments] = useState<TrainerAssignment[]>([]);
  const [feedbackAnalytics, setFeedbackAnalytics] = useState<FeedbackAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sessionsData, assignmentsData] = await Promise.allSettled([
        sessionsApi.getAll({ limit: 10, sortBy: 'date', sortOrder: 'desc' }),
        trainerAssignmentsApi.getMyAssignments(),
      ]);

      if (sessionsData.status === 'fulfilled') setSessions(sessionsData.value.data);
      if (assignmentsData.status === 'fulfilled') setAssignments(assignmentsData.value);

      try {
        const analytics = await feedbackApi.getAnalytics();
        setFeedbackAnalytics(analytics);
      } catch {
        // ignore
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

  const activeSessions = sessions.filter(
    (s) => s.status === 'scheduled' || s.status === 'ongoing'
  );
  const pendingSubmissions = sessions.filter(
    (s) => s.status === 'completed' && !s.attendanceSubmitted
  );

  return (
    <div>
      <div className="page-header">
        <h2>Trainer Dashboard</h2>
        <p className="page-subtitle">Welcome back, {user?.name}</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--primary-light)' }}>📋</div>
          <div className="stat-content">
            <h3>{activeSessions.length}</h3>
            <p>Active Sessions</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--warning-light)' }}>⏳</div>
          <div className="stat-content">
            <h3>{pendingSubmissions.length}</h3>
            <p>Pending Submissions</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--success-light)' }}>🎓</div>
          <div className="stat-content">
            <h3>{assignments.length}</h3>
            <p>Assigned Batches</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--info-light)' }}>⭐</div>
          <div className="stat-content">
            <h3>{feedbackAnalytics?.overall?.averageRating?.toFixed(1) ?? 'N/A'}</h3>
            <p>Avg Feedback Rating</p>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div className="card">
          <div className="card-header">
            <h3>Upcoming Sessions</h3>
          </div>
          <div className="card-body">
            {activeSessions.length === 0 ? (
              <p className="empty-state">No active sessions</p>
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
                  {activeSessions.slice(0, 5).map((session) => (
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

        <div className="card">
          <div className="card-header">
            <h3>Attendance Submissions</h3>
          </div>
          <div className="card-body">
            {pendingSubmissions.length === 0 ? (
              <p className="empty-state">All submissions are up to date</p>
            ) : (
              <div className="activity-list">
                {pendingSubmissions.slice(0, 5).map((session) => (
                  <div key={session.id} className="activity-item">
                    <span className="activity-action">{session.title}</span>
                    <span className="badge badge-warning">Pending</span>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => navigate(`/attendance-mark/${session.id}`)}
                    >
                      Mark Now
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {feedbackAnalytics && feedbackAnalytics.trainerWise && feedbackAnalytics.trainerWise.length > 0 && (
        <div className="card" style={{ marginTop: '20px' }}>
          <div className="card-header">
            <h3>Recent Feedback Summary</h3>
          </div>
          <div className="card-body">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Trainer</th>
                  <th>Average Rating</th>
                  <th>Responses</th>
                </tr>
              </thead>
              <tbody>
                {feedbackAnalytics.trainerWise.map((rating) => (
                  <tr key={rating.trainerId}>
                    <td>{rating.trainerName}</td>
                    <td>
                      <span className="badge badge-info">{rating.averageRating.toFixed(1)} / 5</span>
                    </td>
                    <td>{rating.responseCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {assignments.length > 0 && (
        <div className="card" style={{ marginTop: '20px' }}>
          <div className="card-header">
            <h3>My Assignments</h3>
          </div>
          <div className="card-body">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Subject</th>
                  <th>Start Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => (
                  <tr key={a.id}>
                    <td>{a.batch?.name ?? a.batchId}</td>
                    <td>{a.subject ?? '-'}</td>
                    <td>{new Date(a.startDate).toLocaleDateString()}</td>
                    <td>
                      <span className={`badge ${a.isActive ? 'badge-success' : 'badge-danger'}`}>
                        {a.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

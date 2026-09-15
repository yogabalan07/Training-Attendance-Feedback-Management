import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sessionsApi, trainerAssignmentsApi } from '../../lib/api';
import type { Session } from '../../lib/types';

export default function MySessions() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    date: '',
    status: '',
  });

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    setLoading(true);
    try {
      const assignments = await trainerAssignmentsApi.getMyAssignments();
      const batchIds = assignments.map((a) => a.batchId);

      const allSessions: Session[] = [];
      const results = await Promise.allSettled(
        batchIds.map(() =>
          sessionsApi.getAll({ limit: 50, sortBy: 'date', sortOrder: 'desc' })
        )
      );

      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          result.value.data.forEach((s) => {
            if (batchIds.includes(s.batchId) && !allSessions.find((x) => x.id === s.id)) {
              allSessions.push(s);
            }
          });
        }
      });

      allSessions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setSessions(allSessions);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredSessions = sessions.filter((s) => {
    if (filters.date && !s.date.startsWith(filters.date)) return false;
    if (filters.status && s.status !== filters.status) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Loading sessions...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h2>My Sessions</h2>
        <p className="page-subtitle">Sessions from your assigned batches</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Sessions</h3>
          <div style={{ display: 'flex', gap: '12px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <input
                type="date"
                value={filters.date}
                onChange={(e) => setFilters({ ...filters, date: e.target.value })}
                placeholder="Filter by date"
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              >
                <option value="">All Status</option>
                <option value="scheduled">Scheduled</option>
                <option value="ongoing">Ongoing</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            {(filters.date || filters.status) && (
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setFilters({ date: '', status: '' })}
              >
                Clear
              </button>
            )}
          </div>
        </div>
        <div className="card-body">
          {filteredSessions.length === 0 ? (
            <p className="empty-state">No sessions found</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Session Type</th>
                  <th>Subject</th>
                  <th>Topic</th>
                  <th>Batch</th>
                  <th>Attendance</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSessions.map((session) => (
                  <tr key={session.id}>
                    <td>{new Date(session.date).toLocaleDateString()}</td>
                    <td>
                      {session.startTime} - {session.endTime}
                    </td>
                    <td>{session.title}</td>
                    <td>{session.description?.split(' - ')[0] ?? '-'}</td>
                    <td>{session.description ?? '-'}</td>
                    <td>{session.batch?.name ?? session.batchId}</td>
                    <td>
                      <span
                        className={`badge ${
                          session.attendanceSubmitted ? 'badge-success' : 'badge-warning'
                        }`}
                      >
                        {session.attendanceSubmitted ? 'Submitted' : 'Pending'}
                      </span>
                    </td>
                    <td>
                      {(session.status === 'completed' || session.status === 'ongoing') &&
                        !session.attendanceSubmitted && (
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => navigate(`/attendance-mark/${session.id}`)}
                          >
                            Mark Attendance
                          </button>
                        )}
                      {session.attendanceSubmitted && (
                        <span className="badge badge-success">Done</span>
                      )}
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

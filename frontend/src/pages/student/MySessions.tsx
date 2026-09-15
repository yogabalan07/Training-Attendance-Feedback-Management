import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sessionsApi, studentsApi, attendanceApi } from '../../lib/api';
import type { Session, Attendance } from '../../lib/types';

export default function MySessions() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [attendanceMap, setAttendanceMap] = useState<Map<string, Attendance>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    setLoading(true);
    try {
      const studentData = await studentsApi.getAll({ limit: 1 });
      if (!studentData.data || studentData.data.length === 0) return;

      const student = studentData.data[0];
      const sessionsData = await sessionsApi.getAll({ limit: 100, sortBy: 'date', sortOrder: 'desc' });
      const batchSessions = sessionsData.data.filter((s) => s.batchId === student.batchId);
      setSessions(batchSessions);

      const attendanceData = await attendanceApi.getAll({ studentId: student.id, limit: 200 });
      const map = new Map<string, Attendance>();
      attendanceData.data.forEach((a) => map.set(a.sessionId, a));
      setAttendanceMap(map);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    } finally {
      setLoading(false);
    }
  };

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
        <p className="page-subtitle">Sessions for your batch</p>
      </div>

      <div className="card">
        <div className="card-body">
          {sessions.length === 0 ? (
            <p className="empty-state">No sessions found</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Subject</th>
                  <th>Topic</th>
                  <th>Session Type</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => {
                  const attendance = attendanceMap.get(session.id);
                  return (
                    <tr key={session.id}>
                      <td>{new Date(session.date).toLocaleDateString()}</td>
                      <td>
                        {session.startTime} - {session.endTime}
                      </td>
                      <td>{session.description?.split(' - ')[0] ?? '-'}</td>
                      <td>{session.title}</td>
                      <td>{session.description ?? '-'}</td>
                      <td>
                        {attendance ? (
                          <span className={`badge badge-${attendance.status}`}>
                            {attendance.status}
                          </span>
                        ) : (
                          <span className="badge badge-warning">No Record</span>
                        )}
                      </td>
                      <td>
                        {session.status === 'completed' && !attendanceMap.has(session.id) && (
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => navigate(`/give-feedback/${session.id}`)}
                          >
                            Give Feedback
                          </button>
                        )}
                        {session.status === 'completed' && attendanceMap.has(session.id) && (
                          <span className="badge badge-success">Attended</span>
                        )}
                        {session.status === 'scheduled' && (
                          <span className="badge badge-info">Upcoming</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

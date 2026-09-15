import { useState, useEffect, useCallback } from 'react';
import { feedbackApi } from '../../lib/api';
import type { PaginatedResponse } from '../../lib/types';

export default function FeedbackManagement() {
  const [data, setData] = useState<PaginatedResponse<any> | null>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<'list' | 'analytics'>('list');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await feedbackApi.getAll({ page, limit: 20 });
      setData(res);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to load feedback');
    } finally {
      setLoading(false);
    }
  }, [page]);

  const fetchAnalytics = useCallback(async () => {
    try {
      const res = await feedbackApi.getAnalytics({});
      setAnalytics(res);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to load analytics');
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'list') fetchData();
    else fetchAnalytics();
  }, [activeTab, fetchData, fetchAnalytics]);

  const handleExport = async () => {
    try {
      const res = await feedbackApi.export({});
      const blob = new Blob([res.data]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'feedback.csv';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      setError('Failed to export');
    }
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Feedback Management</h2>
          <p className="page-subtitle">View and analyze session feedback</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" onClick={handleExport}>Export CSV</button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div style={{ display: 'flex', gap: 0, marginBottom: 16 }}>
        <button className={`btn ${activeTab === 'list' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveTab('list')} style={{ borderRadius: 'var(--radius) 0 0 var(--radius)' }}>Feedback List</button>
        <button className={`btn ${activeTab === 'analytics' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveTab('analytics')} style={{ borderRadius: '0 var(--radius) var(--radius) 0' }}>Analytics</button>
      </div>

      {activeTab === 'list' ? (
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            {loading ? (
              <div className="loading-screen"><div className="spinner" /><span>Loading...</span></div>
            ) : !data?.data?.length ? (
              <div className="empty-state">No feedback responses found</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Session</th>
                    <th>Department</th>
                    <th>Batch</th>
                    <th>Rating</th>
                    <th>Comments</th>
                    <th>Anonymous</th>
                    <th>Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((f: any) => (
                    <tr key={f.id}>
                      <td>{f.session?.date ? new Date(f.session.date).toLocaleDateString() : '-'}</td>
                      <td>{f.session?.title || '-'}</td>
                      <td>{f.session?.batch?.department?.name || '-'}</td>
                      <td>{f.session?.batch?.name || '-'}</td>
                      <td>{f.overallRating || '-'}</td>
                      <td>{f.comments || <span style={{ color: 'var(--text-secondary)' }}>-</span>}</td>
                      <td>
                        <span className={`badge ${f.isAnonymous ? 'badge-info' : 'badge-success'}`}>
                          {f.isAnonymous ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td>{f.submittedAt ? new Date(f.submittedAt).toLocaleString() : '-'}</td>
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
      ) : (
        <div>
          {analytics ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
                <div className="card">
                  <div className="card-body" style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--primary)' }}>{analytics.overall?.averageRating || 0}</div>
                    <div style={{ color: 'var(--text-secondary)' }}>Avg Rating</div>
                  </div>
                </div>
                <div className="card">
                  <div className="card-body" style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--primary)' }}>{analytics.overall?.totalResponses || 0}</div>
                    <div style={{ color: 'var(--text-secondary)' }}>Total Responses</div>
                  </div>
                </div>
                <div className="card">
                  <div className="card-body" style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--primary)' }}>{analytics.trainerWise?.length || 0}</div>
                    <div style={{ color: 'var(--text-secondary)' }}>Trainers</div>
                  </div>
                </div>
                <div className="card">
                  <div className="card-body" style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--primary)' }}>{analytics.subjectWise?.length || 0}</div>
                    <div style={{ color: 'var(--text-secondary)' }}>Subjects</div>
                  </div>
                </div>
              </div>

              {analytics.questionWise?.length > 0 && (
                <div className="card" style={{ marginBottom: 16 }}>
                  <div className="card-header"><strong>Question-wise Ratings</strong></div>
                  <div className="card-body" style={{ padding: 0 }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Question</th>
                          <th>Category</th>
                          <th>Avg Rating</th>
                          <th>Responses</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.questionWise.map((q: any) => (
                          <tr key={q.questionId}>
                            <td>{q.question}</td>
                            <td><span className="badge badge-info">{q.category}</span></td>
                            <td>{q.averageRating}</td>
                            <td>{q.responseCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {analytics.trainerWise?.length > 0 && (
                <div className="card">
                  <div className="card-header"><strong>Trainer-wise Ratings</strong></div>
                  <div className="card-body" style={{ padding: 0 }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Trainer</th>
                          <th>Avg Rating</th>
                          <th>Responses</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.trainerWise.map((t: any) => (
                          <tr key={t.trainerId}>
                            <td>{t.trainerName}</td>
                            <td>{t.averageRating}</td>
                            <td>{t.responseCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="loading-screen"><div className="spinner" /><span>Loading analytics...</span></div>
          )}
        </div>
      )}
    </div>
  );
}

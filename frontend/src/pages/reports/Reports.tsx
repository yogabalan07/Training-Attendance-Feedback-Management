import { useEffect, useState } from 'react';
import {
  reportsApi,
  attendanceApi,
  feedbackApi,
  departmentsApi,
  academicYearsApi,
  batchesApi,
  trainersApi,
} from '../../lib/api';
import type {
  Department,
  AcademicYear,
  Batch,
  Trainer,
  DashboardStats,
  FeedbackAnalytics,
} from '../../lib/types';

type TabKey = 'attendance' | 'feedback' | 'dashboard';

export default function Reports() {
  const [activeTab, setActiveTab] = useState<TabKey>('attendance');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [trainers, setTrainers] = useState<Trainer[]>([]);

  const [filters, setFilters] = useState({
    departmentId: '',
    academicYearId: '',
    batchId: '',
    startDate: '',
    endDate: '',
    trainerId: '',
  });

  const [attendanceReport, setAttendanceReport] = useState<any>(null);
  const [feedbackAnalytics, setFeedbackAnalytics] = useState<FeedbackAnalytics | null>(null);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState('');

  useEffect(() => {
    loadDropdowns();
  }, []);

  useEffect(() => {
    if (activeTab === 'dashboard') {
      loadDashboard();
    }
  }, [activeTab]);

  const loadDropdowns = async () => {
    try {
      const [deptData, yearData, batchData, trainerData] = await Promise.allSettled([
        departmentsApi.getAll(),
        academicYearsApi.getAll(),
        batchesApi.getAll(),
        trainersApi.getAll(),
      ]);
      if (deptData.status === 'fulfilled') setDepartments(deptData.value.data);
      if (yearData.status === 'fulfilled') setAcademicYears(yearData.value.data);
      if (batchData.status === 'fulfilled') setBatches(batchData.value.data);
      if (trainerData.status === 'fulfilled') setTrainers(trainerData.value.data);
    } catch (err) {
      console.error('Failed to load dropdowns:', err);
    }
  };

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const data = await reportsApi.getDashboard();
      setDashboardStats(data);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAttendanceReport = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (filters.batchId) params.batchId = filters.batchId;
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      if (filters.trainerId) params.trainerId = filters.trainerId;
      const data = await reportsApi.getAttendance(params);
      setAttendanceReport(data);
    } catch (err) {
      console.error('Failed to load attendance report:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchFeedbackReport = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (filters.batchId) params.batchId = filters.batchId;
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      if (filters.trainerId) params.trainerId = filters.trainerId;
      const [, analyticsData] = await Promise.allSettled([
        reportsApi.getFeedback(params),
        feedbackApi.getAnalytics(params),
      ]);
      if (analyticsData.status === 'fulfilled') setFeedbackAnalytics(analyticsData.value);
    } catch (err) {
      console.error('Failed to load feedback report:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFetch = () => {
    if (activeTab === 'attendance') fetchAttendanceReport();
    else if (activeTab === 'feedback') fetchFeedbackReport();
  };

  const exportFile = async (type: 'attendance' | 'feedback') => {
    setExporting(type);
    try {
      const params: any = {};
      if (filters.batchId) params.batchId = filters.batchId;
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      if (filters.trainerId) params.trainerId = filters.trainerId;

      let blob: Blob;
      if (type === 'attendance') {
        blob = await attendanceApi.export(params);
      } else {
        blob = await feedbackApi.export(params);
      }

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${type}-report.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export:', err);
    } finally {
      setExporting('');
    }
  };

  const resetFilters = () => {
    setFilters({
      departmentId: '',
      academicYearId: '',
      batchId: '',
      startDate: '',
      endDate: '',
      trainerId: '',
    });
    setAttendanceReport(null);
    setFeedbackAnalytics(null);
  };

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'attendance', label: 'Attendance Report' },
    { key: 'feedback', label: 'Feedback Report' },
    { key: 'dashboard', label: 'Dashboard Summary' },
  ];

  return (
    <div>
      <div className="page-header">
        <h2>Reports</h2>
        <p className="page-subtitle">View and export system reports</p>
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-body" style={{ display: 'flex', gap: '8px', padding: '12px 20px' }}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`btn ${activeTab === tab.key ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab !== 'dashboard' && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <div className="card-header">
            <h3>Filters</h3>
            <button className="btn btn-sm btn-outline" onClick={resetFilters}>
              Reset Filters
            </button>
          </div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              <div className="form-group">
                <label>Department</label>
                <select
                  value={filters.departmentId}
                  onChange={(e) => setFilters({ ...filters, departmentId: e.target.value })}
                >
                  <option value="">All Departments</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Academic Year</label>
                <select
                  value={filters.academicYearId}
                  onChange={(e) => setFilters({ ...filters, academicYearId: e.target.value })}
                >
                  <option value="">All Years</option>
                  {academicYears.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.year}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Batch</label>
                <select
                  value={filters.batchId}
                  onChange={(e) => setFilters({ ...filters, batchId: e.target.value })}
                >
                  <option value="">All Batches</option>
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Start Date</label>
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>End Date</label>
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Trainer</label>
                <select
                  value={filters.trainerId}
                  onChange={(e) => setFilters({ ...filters, trainerId: e.target.value })}
                >
                  <option value="">All Trainers</option>
                  {trainers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.user?.name ?? t.employeeId}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
              <button className="btn btn-primary" onClick={handleFetch} disabled={loading}>
                {loading ? 'Loading...' : 'Generate Report'}
              </button>
              <button
                className="btn btn-outline"
                onClick={() => exportFile('attendance')}
                disabled={exporting === 'attendance'}
              >
                {exporting === 'attendance' ? 'Exporting...' : 'Export CSV'}
              </button>
              <button
                className="btn btn-outline"
                onClick={() => exportFile('feedback')}
                disabled={exporting === 'feedback'}
              >
                {exporting === 'feedback' ? 'Exporting...' : 'Export XLSX'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="loading-screen">
          <div className="spinner" />
          <p>Generating report...</p>
        </div>
      )}

      {activeTab === 'attendance' && attendanceReport && !loading && (
        <div className="card">
          <div className="card-header">
            <h3>Attendance Report</h3>
          </div>
          <div className="card-body">
            {typeof attendanceReport === 'object' && attendanceReport.data ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Batch</th>
                    <th>Total Sessions</th>
                    <th>Present</th>
                    <th>Absent</th>
                    <th>Percentage</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceReport.data.map((record: any, idx: number) => (
                    <tr key={idx}>
                      <td>{record.studentName ?? record.student?.user?.name ?? '-'}</td>
                      <td>{record.batchName ?? record.batch?.name ?? '-'}</td>
                      <td>{record.totalSessions ?? 0}</td>
                      <td>{record.present ?? 0}</td>
                      <td>{record.absent ?? 0}</td>
                      <td>
                        <span
                          className={`badge ${
                            (record.percentage ?? 0) >= 75 ? 'badge-success' : 'badge-danger'
                          }`}
                        >
                          {(record.percentage ?? 0).toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    {Object.keys(attendanceReport).map((key) => (
                      <th key={key}>{key}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {Object.values(attendanceReport).map((val, idx) => (
                      <td key={idx}>{String(val)}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 'feedback' && !loading && (
        <>
          {feedbackAnalytics && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
              <div className="card">
                <div className="card-body" style={{ textAlign: 'center' }}>
                  <h3 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--primary)' }}>
                    {feedbackAnalytics.overall?.averageRating?.toFixed(1) ?? '0.0'}
                  </h3>
                  <p style={{ color: 'var(--text-secondary)' }}>Average Rating</p>
                </div>
              </div>
              <div className="card">
                <div className="card-body" style={{ textAlign: 'center' }}>
                  <h3 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--success)' }}>
                    {feedbackAnalytics.overall?.totalResponses ?? 0}
                  </h3>
                  <p style={{ color: 'var(--text-secondary)' }}>Total Responses</p>
                </div>
              </div>
            </div>
          )}

          {feedbackAnalytics && feedbackAnalytics.questionWise && feedbackAnalytics.questionWise.length > 0 && (
            <div className="card" style={{ marginBottom: '20px' }}>
              <div className="card-header">
                <h3>Question Analytics</h3>
              </div>
              <div className="card-body">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Question</th>
                      <th>Avg Rating</th>
                      <th>Responses</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feedbackAnalytics.questionWise.map((qa) => (
                      <tr key={qa.questionId}>
                        <td>{qa.question}</td>
                        <td>
                          {qa.averageRating != null ? (
                            <span className="badge badge-info">{qa.averageRating.toFixed(1)} / 5</span>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td>{qa.responseCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {feedbackAnalytics && feedbackAnalytics.trainerWise && feedbackAnalytics.trainerWise.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h3>Trainer Ratings</h3>
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
                    {feedbackAnalytics.trainerWise.map((tr) => (
                      <tr key={tr.trainerId}>
                        <td>{tr.trainerName}</td>
                        <td>
                          <span className="badge badge-info">{tr.averageRating.toFixed(1)} / 5</span>
                        </td>
                        <td>{tr.responseCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!feedbackAnalytics && (
            <div className="card">
              <div className="card-body">
                <p className="empty-state">Click "Generate Report" to load feedback analytics</p>
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'dashboard' && !loading && dashboardStats && (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon" style={{ background: 'var(--primary-light)' }}>👤</div>
              <div className="stat-content">
                <h3>{dashboardStats.totalUsers ?? 0}</h3>
                <p>Total Users</p>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon" style={{ background: 'var(--success-light)' }}>🎓</div>
              <div className="stat-content">
                <h3>{dashboardStats.totalStudents ?? 0}</h3>
                <p>Students</p>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon" style={{ background: 'var(--info-light)' }}>👨‍🏫</div>
              <div className="stat-content">
                <h3>{dashboardStats.totalTrainers ?? 0}</h3>
                <p>Trainers</p>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon" style={{ background: 'var(--warning-light)' }}>📋</div>
              <div className="stat-content">
                <h3>{dashboardStats.totalSessions ?? 0}</h3>
                <p>Total Sessions</p>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon" style={{ background: 'var(--success-light)' }}>✅</div>
              <div className="stat-content">
                <h3>{dashboardStats.completedSessions ?? 0}</h3>
                <p>Completed Sessions</p>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon" style={{ background: 'var(--primary-light)' }}>📊</div>
              <div className="stat-content">
                <h3>{dashboardStats.attendanceRate?.toFixed(1) ?? 0}%</h3>
                <p>Attendance Rate</p>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon" style={{ background: 'var(--info-light)' }}>💬</div>
              <div className="stat-content">
                <h3>{dashboardStats.feedbackCount ?? 0}</h3>
                <p>Feedback Responses</p>
              </div>
            </div>
          </div>

          {dashboardStats.recentActivity && dashboardStats.recentActivity.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h3>Recent Activity</h3>
              </div>
              <div className="card-body">
                <div className="activity-list">
                  {dashboardStats.recentActivity.map((activity) => (
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
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { sessionsApi, trainersApi, departmentsApi, academicYearsApi, batchesApi } from '../../lib/api';
import type { Session, Trainer, Department, AcademicYear, Batch, PaginatedResponse } from '../../lib/types';

export default function Sessions() {
  const [data, setData] = useState<PaginatedResponse<Session> | null>(null);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [allBatches, setAllBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<Session | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    date: '',
    startTime: '',
    endTime: '',
    trainerId: '',
    batchId: '',
    academicYearId: '',
    venue: '',
    sessionType: 'FORENOON',
    selectedBatches: [] as string[],
  });
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: any = { page, limit: 10 };
      if (search) params.search = search;
      const res = await sessionsApi.getAll(params);
      let filtered = res.data;
      if (statusFilter) filtered = filtered.filter((s) => s.status === statusFilter);
      if (deptFilter) filtered = filtered.filter((s) => s.batch?.departmentId === deptFilter);
      if (startDate) filtered = filtered.filter((s) => s.date >= startDate);
      if (endDate) filtered = filtered.filter((s) => s.date <= endDate);
      setData({ ...res, data: filtered });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, deptFilter, startDate, endDate]);

  useEffect(() => {
    Promise.all([
      trainersApi.getAll({ limit: 100 }).then((r) => setTrainers(r.data)),
      departmentsApi.getAll({ limit: 100 }).then((r) => setDepartments(r.data)),
      academicYearsApi.getAll({ limit: 100 }).then((r) => setAcademicYears(r.data)),
      batchesApi.getAll({ limit: 100 }).then((r) => setAllBatches(r.data)),
    ]).catch(() => {});
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreate = () => {
    setEditItem(null);
    setFormData({
      title: '',
      description: '',
      date: '',
      startTime: '',
      endTime: '',
      trainerId: '',
      batchId: '',
      academicYearId: '',
      venue: '',
      sessionType: 'FORENOON',
      selectedBatches: [],
    });
    setShowModal(true);
  };

  const openEdit = (s: Session) => {
    setEditItem(s);
    setFormData({
      title: s.title,
      description: s.description || '',
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      trainerId: s.trainerId,
      batchId: s.batchId,
      academicYearId: s.academicYearId,
      venue: s.venue || '',
      sessionType: 'FORENOON',
      selectedBatches: [s.batchId],
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const batchId = editItem ? editItem.batchId : formData.selectedBatches[0] || formData.batchId;
      const payload: Partial<Session> = {
        title: formData.title || `${formData.sessionType} Session - ${formData.date}`,
        description: formData.description || undefined,
        date: formData.date,
        startTime: formData.startTime,
        endTime: formData.endTime,
        trainerId: formData.trainerId,
        batchId,
        academicYearId: formData.academicYearId || undefined,
        venue: formData.venue || undefined,
      };
      if (editItem) {
        await sessionsApi.update(editItem.id, payload);
      } else {
        await sessionsApi.create(payload);
      }
      setShowModal(false);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save session');
    } finally {
      setSaving(false);
    }
  };

  const statusBadge = (status: string) => {
    return <span className={`badge badge-${status}`}>{status}</span>;
  };

  const attendanceBadge = (submitted: boolean) => {
    return <span className={`badge ${submitted ? 'badge-success' : 'badge-warning'}`}>{submitted ? 'Submitted' : 'Pending'}</span>;
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Sessions</h2>
          <p className="page-subtitle">Manage training sessions</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Add Session</button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Search sessions..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.9rem', width: 200 }}
            />
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.9rem' }}>
              <option value="">All Status</option>
              <option value="scheduled">Scheduled</option>
              <option value="ongoing">Ongoing</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <select value={deptFilter} onChange={(e) => { setDeptFilter(e.target.value); setPage(1); }} style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.9rem' }}>
              <option value="">All Departments</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }} style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.9rem' }} />
            <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }} style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.9rem' }} />
          </div>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div className="loading-screen"><div className="spinner" /><span>Loading...</span></div>
          ) : !data?.data.length ? (
            <div className="empty-state">No sessions found</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Subject</th>
                  <th>Trainer</th>
                  <th>Batch</th>
                  <th>Status</th>
                  <th>Attendance</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((s) => (
                  <tr key={s.id}>
                    <td>{s.date}</td>
                    <td>{s.startTime} - {s.endTime}</td>
                    <td>{s.title}</td>
                    <td>{s.trainer?.user?.name || '-'}</td>
                    <td>{s.batch?.name || '-'}</td>
                    <td>{statusBadge(s.status)}</td>
                    <td>{attendanceBadge(s.attendanceSubmitted)}</td>
                    <td>
                      <button className="btn btn-sm btn-outline" onClick={() => openEdit(s)}>Edit</button>
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

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <h3>{editItem ? 'Edit Session' : 'Create Session'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label>Date</label>
                  <input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Session Type</label>
                  <select value={formData.sessionType} onChange={(e) => setFormData({ ...formData, sessionType: e.target.value })}>
                    <option value="FORENOON">Forenoon</option>
                    <option value="AFTERNOON">Afternoon</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Start Time</label>
                  <input type="time" value={formData.startTime} onChange={(e) => setFormData({ ...formData, startTime: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>End Time</label>
                  <input type="time" value={formData.endTime} onChange={(e) => setFormData({ ...formData, endTime: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label>Subject / Title</label>
                <input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="Session subject or title" />
              </div>
              <div className="form-group">
                <label>Topic (optional)</label>
                <input value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Trainer</label>
                <select value={formData.trainerId} onChange={(e) => setFormData({ ...formData, trainerId: e.target.value })}>
                  <option value="">Select trainer</option>
                  {trainers.filter((t) => t.isActive).map((t) => (
                    <option key={t.id} value={t.id}>{t.user?.name} ({t.isExternal ? 'External' : 'Internal'})</option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Academic Year</label>
                  <select value={formData.academicYearId} onChange={(e) => setFormData({ ...formData, academicYearId: e.target.value })}>
                    <option value="">None</option>
                    {academicYears.map((y) => <option key={y.id} value={y.id}>{y.year}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Venue</label>
                  <input value={formData.venue} onChange={(e) => setFormData({ ...formData, venue: e.target.value })} />
                </div>
              </div>
              {!editItem && (
                <div className="form-group">
                  <label>Batches</label>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 12, maxHeight: 150, overflowY: 'auto' }}>
                    {allBatches.filter((b) => b.isActive).map((b) => (
                      <label key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={formData.selectedBatches.includes(b.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormData({ ...formData, selectedBatches: [...formData.selectedBatches, b.id] });
                            } else {
                              setFormData({ ...formData, selectedBatches: formData.selectedBatches.filter((id) => id !== b.id) });
                            }
                          }}
                        />
                        {b.name} ({b.department?.name})
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editItem ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

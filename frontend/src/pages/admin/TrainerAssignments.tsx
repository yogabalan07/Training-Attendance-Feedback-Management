import { useState, useEffect, useCallback } from 'react';
import { trainerAssignmentsApi, trainersApi, departmentsApi, academicYearsApi, batchesApi } from '../../lib/api';
import type { TrainerAssignment, Trainer, Department, AcademicYear, Batch, PaginatedResponse } from '../../lib/types';

export default function TrainerAssignments() {
  const [data, setData] = useState<PaginatedResponse<TrainerAssignment> | null>(null);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [allBatches, setAllBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<TrainerAssignment | null>(null);
  const [formData, setFormData] = useState({
    trainerId: '',
    departmentId: '',
    academicYearId: '',
    batchId: '',
    subject: '',
  });
  const [saving, setSaving] = useState(false);
  const [trainerTypeFilter, setTrainerTypeFilter] = useState('');

  const filteredBatches = allBatches.filter((b) => {
    if (formData.departmentId && b.departmentId !== formData.departmentId) return false;
    if (formData.academicYearId && b.academicYearId !== formData.academicYearId) return false;
    return true;
  });

  const filteredTrainers = trainers.filter((t) => {
    if (trainerTypeFilter === 'INTERNAL' && t.isExternal) return false;
    if (trainerTypeFilter === 'EXTERNAL' && !t.isExternal) return false;
    return t.isActive;
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await trainerAssignmentsApi.getAll({ page, limit: 10 });
      setData(res);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load assignments');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    Promise.all([
      trainersApi.getAll({ limit: 100 }).then((r) => setTrainers(r.data)),
      departmentsApi.getAll({ limit: 100 }).then((r) => setDepartments(r.data)),
      academicYearsApi.getAll({ limit: 100 }).then((r) => setAcademicYears(r.data)),
      batchesApi.getAll({ limit: 100 }).then((r) => setAllBatches(r.data)),
    ]).catch(() => {});
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async () => {
    setSaving(true);
    setError('');
    try {
      await trainerAssignmentsApi.create({
        trainerId: formData.trainerId,
        batchId: formData.batchId,
        academicYearId: formData.academicYearId,
        subject: formData.subject || undefined,
        startDate: new Date().toISOString(),
      });
      setShowModal(false);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create assignment');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setSaving(true);
    setError('');
    try {
      await trainerAssignmentsApi.delete(confirmDelete.id);
      setConfirmDelete(null);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete assignment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Trainer Assignments</h2>
          <p className="page-subtitle">Manage trainer-batch assignments</p>
        </div>
        <button className="btn btn-primary" onClick={() => {
          setFormData({ trainerId: '', departmentId: '', academicYearId: '', batchId: '', subject: '' });
          setShowModal(true);
        }}>+ Add Assignment</button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div className="loading-screen"><div className="spinner" /><span>Loading...</span></div>
          ) : !data?.data.length ? (
            <div className="empty-state">No assignments found</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Trainer</th>
                  <th>Type</th>
                  <th>Batch</th>
                  <th>Department</th>
                  <th>Academic Year</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((a) => (
                  <tr key={a.id}>
                    <td>{a.trainer?.user?.name || '-'}</td>
                    <td>
                      <span className={`badge ${a.trainer?.isExternal ? 'badge-info' : 'badge-primary'}`}>
                        {a.trainer?.isExternal ? 'EXTERNAL' : 'INTERNAL'}
                      </span>
                    </td>
                    <td>{a.batch?.name || '-'}</td>
                    <td>{a.batch?.department?.name || '-'}</td>
                    <td>{a.academicYear?.year || '-'}</td>
                    <td>
                      <button className="btn btn-sm btn-danger" onClick={() => setConfirmDelete(a)}>Delete</button>
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
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Create Assignment</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Trainer Type Filter</label>
                <select value={trainerTypeFilter} onChange={(e) => { setTrainerTypeFilter(e.target.value); setFormData({ ...formData, trainerId: '' }); }} style={{ marginBottom: 8 }}>
                  <option value="">All Trainers</option>
                  <option value="INTERNAL">Internal Only</option>
                  <option value="EXTERNAL">External Only</option>
                </select>
              </div>
              <div className="form-group">
                <label>Trainer</label>
                <select value={formData.trainerId} onChange={(e) => setFormData({ ...formData, trainerId: e.target.value })}>
                  <option value="">Select trainer</option>
                  {filteredTrainers.map((t) => (
                    <option key={t.id} value={t.id}>{t.user?.name} ({t.isExternal ? 'External' : 'Internal'})</option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Department</label>
                  <select value={formData.departmentId} onChange={(e) => setFormData({ ...formData, departmentId: e.target.value, batchId: '' })}>
                    <option value="">Select department</option>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Academic Year</label>
                  <select value={formData.academicYearId} onChange={(e) => setFormData({ ...formData, academicYearId: e.target.value, batchId: '' })}>
                    <option value="">Select year</option>
                    {academicYears.map((y) => <option key={y.id} value={y.id}>{y.year}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Batch</label>
                <select value={formData.batchId} onChange={(e) => setFormData({ ...formData, batchId: e.target.value })}>
                  <option value="">Select batch</option>
                  {filteredBatches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Subject (optional)</label>
                <input value={formData.subject} onChange={(e) => setFormData({ ...formData, subject: e.target.value })} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={saving || !formData.trainerId || !formData.batchId}>
                {saving ? 'Saving...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3>Confirm Delete</h3>
              <button className="modal-close" onClick={() => setConfirmDelete(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to remove the assignment for <strong>{confirmDelete.trainer?.user?.name}</strong> from batch <strong>{confirmDelete.batch?.name}</strong>?</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDelete} disabled={saving}>
                {saving ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { batchesApi, departmentsApi, academicYearsApi } from '../../lib/api';
import type { Batch, Department, AcademicYear, PaginatedResponse } from '../../lib/types';

export default function Batches() {
  const [data, setData] = useState<PaginatedResponse<Batch> | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<Batch | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    departmentId: '',
    academicYearId: '',
    semester: 1,
    section: '',
  });
  const [saving, setSaving] = useState(false);

  const filteredYears = academicYears.filter((year) => {
    if (!formData.departmentId) return true;
    return year.departmentId === formData.departmentId;
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await batchesApi.getAll({ page, limit: 10, search: search || undefined });
      setData(res);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load batches');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    Promise.all([
      departmentsApi.getAll({ limit: 100 }).then((r) => setDepartments(r.data)),
      academicYearsApi.getAll({ limit: 100 }).then((r) => setAcademicYears(r.data)),
    ]).catch(() => {});
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreate = () => {
    setEditItem(null);
    setFormData({ name: '', code: '', departmentId: '', academicYearId: '', semester: 1, section: '' });
    setShowModal(true);
  };

  const openEdit = (item: Batch) => {
    setEditItem(item);
    setFormData({
      name: item.name,
      code: item.code,
      departmentId: item.departmentId,
      academicYearId: item.academicYearId,
      semester: item.semester,
      section: item.section || '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      if (editItem) {
        await batchesApi.update(editItem.id, {
          name: formData.name,
          code: formData.code,
          departmentId: formData.departmentId,
          academicYearId: formData.academicYearId,
          semester: formData.semester,
          section: formData.section || undefined,
        });
      } else {
        await batchesApi.create({
          name: formData.name,
          code: formData.code,
          departmentId: formData.departmentId,
          academicYearId: formData.academicYearId,
          semester: formData.semester,
          section: formData.section || undefined,
        });
      }
      setShowModal(false);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save batch');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Batches</h2>
          <p className="page-subtitle">Manage batches</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Add Batch</button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="card-header">
          <input
            type="text"
            placeholder="Search batches..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.9rem', width: 250 }}
          />
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div className="loading-screen"><div className="spinner" /><span>Loading...</span></div>
          ) : !data?.data.length ? (
            <div className="empty-state">No batches found</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Department</th>
                  <th>Academic Year</th>
                  <th>Semester</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((b) => (
                  <tr key={b.id}>
                    <td>{b.name}</td>
                    <td>{b.department?.name || '-'}</td>
                    <td>{b.academicYear?.year || '-'}</td>
                    <td>{b.semester}</td>
                    <td>
                      <span className={`badge ${b.isActive ? 'badge-success' : 'badge-danger'}`}>
                        {b.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-sm btn-outline" onClick={() => openEdit(b)}>Edit</button>
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
              <h3>{editItem ? 'Edit Batch' : 'Create Batch'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Name</label>
                <input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Code</label>
                <input value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Department</label>
                  <select value={formData.departmentId} onChange={(e) => setFormData({ ...formData, departmentId: e.target.value, academicYearId: '' })}>
                    <option value="">Select department</option>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Academic Year</label>
                  <select value={formData.academicYearId} onChange={(e) => setFormData({ ...formData, academicYearId: e.target.value })}>
                    <option value="">Select year</option>
                    {filteredYears.map((y) => <option key={y.id} value={y.id}>{y.year}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Semester</label>
                  <select value={formData.semester} onChange={(e) => setFormData({ ...formData, semester: parseInt(e.target.value) })}>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Section (optional)</label>
                  <input value={formData.section} onChange={(e) => setFormData({ ...formData, section: e.target.value })} />
                </div>
              </div>
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

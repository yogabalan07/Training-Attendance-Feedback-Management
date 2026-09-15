import { useState, useEffect, useCallback } from 'react';
import { academicYearsApi, departmentsApi } from '../../lib/api';
import type { AcademicYear, Department, PaginatedResponse } from '../../lib/types';

export default function AcademicYears() {
  const [data, setData] = useState<PaginatedResponse<AcademicYear> | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<AcademicYear | null>(null);
  const [formData, setFormData] = useState({ year: 1, label: '', departmentId: '' });
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await academicYearsApi.getAll({ page, limit: 10, search: search || undefined });
      setData(res);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load academic years');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    departmentsApi.getAll({ limit: 100 }).then((r) => setDepartments(r.data)).catch(() => {});
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreate = () => {
    setEditItem(null);
    setFormData({ year: 1, label: '', departmentId: '' });
    setShowModal(true);
  };

  const openEdit = (item: AcademicYear) => {
    setEditItem(item);
    setFormData({ year: item.year, label: item.label || '', departmentId: item.departmentId || '' });
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        year: formData.year,
        label: formData.label,
        departmentId: formData.departmentId || undefined,
      };
      if (editItem) {
        await academicYearsApi.update(editItem.id, payload);
      } else {
        await academicYearsApi.create(payload);
      }
      setShowModal(false);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save academic year');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Academic Years</h2>
          <p className="page-subtitle">Manage academic years</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Add Academic Year</button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="card-header">
          <input
            type="text"
            placeholder="Search academic years..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.9rem', width: 250 }}
          />
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div className="loading-screen"><div className="spinner" /><span>Loading...</span></div>
          ) : !data?.data.length ? (
            <div className="empty-state">No academic years found</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Label</th>
                  <th>Department</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((y) => (
                  <tr key={y.id}>
                    <td>{y.year}</td>
                    <td>{y.year}</td>
                    <td>-</td>
                    <td>
                      <span className={`badge ${y.isActive ? 'badge-success' : 'badge-danger'}`}>
                        {y.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-sm btn-outline" onClick={() => openEdit(y)}>Edit</button>
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
              <h3>{editItem ? 'Edit Academic Year' : 'Create Academic Year'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Year (1-4)</label>
                <select value={formData.year} onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) })}>
                  <option value={1}>Year 1</option>
                  <option value={2}>Year 2</option>
                  <option value={3}>Year 3</option>
                  <option value={4}>Year 4</option>
                </select>
              </div>
              <div className="form-group">
                <label>Label</label>
                <input value={formData.label} onChange={(e) => setFormData({ ...formData, label: e.target.value })} placeholder="e.g. 2024-2025" />
              </div>
              <div className="form-group">
                <label>Department</label>
                <select value={formData.departmentId} onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}>
                  <option value="">None</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
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

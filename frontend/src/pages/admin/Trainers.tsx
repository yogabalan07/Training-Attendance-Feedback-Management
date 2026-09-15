import { useState, useEffect, useCallback } from 'react';
import { trainersApi } from '../../lib/api';
import type { Trainer, PaginatedResponse } from '../../lib/types';

export default function Trainers() {
  const [data, setData] = useState<PaginatedResponse<Trainer> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editTrainer, setEditTrainer] = useState<Trainer | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    loginId: '',
    password: '',
    employeeId: '',
    type: 'INTERNAL' as 'INTERNAL' | 'EXTERNAL',
    specialization: '',
  });
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await trainersApi.getAll({ page, limit: 10, search: search || undefined });
      let filtered = res.data;
      if (typeFilter) {
        filtered = filtered.filter((t) => typeFilter === 'EXTERNAL' ? t.isExternal : !t.isExternal);
      }
      setData({ ...res, data: filtered });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load trainers');
    } finally {
      setLoading(false);
    }
  }, [page, search, typeFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreate = () => {
    setEditTrainer(null);
    setFormData({ name: '', loginId: '', password: '', employeeId: '', type: 'INTERNAL', specialization: '' });
    setShowModal(true);
  };

  const openEdit = (t: Trainer) => {
    setEditTrainer(t);
    setFormData({
      name: t.user?.name || '',
      loginId: t.user?.loginId || '',
      password: '',
      employeeId: t.employeeId,
      type: t.isExternal ? 'EXTERNAL' : 'INTERNAL',
      specialization: t.specialization || '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      if (editTrainer) {
        await trainersApi.update(editTrainer.id, {
          employeeId: formData.employeeId,
          isExternal: formData.type === 'EXTERNAL',
          specialization: formData.specialization || undefined,
        });
      } else {
        await trainersApi.create({
          employeeId: formData.employeeId,
          isExternal: formData.type === 'EXTERNAL',
          specialization: formData.specialization || undefined,
          userId: undefined,
        });
      }
      setShowModal(false);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save trainer');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Trainers</h2>
          <p className="page-subtitle">Manage trainers</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Add Trainer</button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Search trainers..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.9rem', width: 250 }}
            />
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
              style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.9rem' }}
            >
              <option value="">All Types</option>
              <option value="INTERNAL">Internal</option>
              <option value="EXTERNAL">External</option>
            </select>
          </div>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div className="loading-screen"><div className="spinner" /><span>Loading...</span></div>
          ) : !data?.data.length ? (
            <div className="empty-state">No trainers found</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Specialization</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((t) => (
                  <tr key={t.id}>
                    <td>{t.user?.name || '-'}</td>
                    <td>
                      <span className={`badge ${t.isExternal ? 'badge-info' : 'badge-primary'}`}>
                        {t.isExternal ? 'EXTERNAL' : 'INTERNAL'}
                      </span>
                    </td>
                    <td>{t.specialization || '-'}</td>
                    <td>
                      <span className={`badge ${t.isActive ? 'badge-success' : 'badge-danger'}`}>
                        {t.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-sm btn-outline" onClick={() => openEdit(t)}>Edit</button>
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
              <h3>{editTrainer ? 'Edit Trainer' : 'Create Trainer'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              {!editTrainer && (
                <>
                  <div className="form-group">
                    <label>Name</label>
                    <input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Login ID</label>
                      <input value={formData.loginId} onChange={(e) => setFormData({ ...formData, loginId: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label>Password</label>
                      <input type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} />
                    </div>
                  </div>
                </>
              )}
              <div className="form-group">
                <label>Employee ID</label>
                <input value={formData.employeeId} onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Type</label>
                <select value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value as 'INTERNAL' | 'EXTERNAL' })}>
                  <option value="INTERNAL">Internal</option>
                  <option value="EXTERNAL">External</option>
                </select>
              </div>
              <div className="form-group">
                <label>Specialization</label>
                <input value={formData.specialization} onChange={(e) => setFormData({ ...formData, specialization: e.target.value })} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editTrainer ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

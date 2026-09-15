import { useState, useEffect, useCallback } from 'react';
import { studentsApi, departmentsApi, academicYearsApi, batchesApi } from '../../lib/api';
import type { Student, Department, AcademicYear, Batch, PaginatedResponse } from '../../lib/types';

export default function Students() {
  const [data, setData] = useState<PaginatedResponse<Student> | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [deptFilter, setDeptFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [batchFilter, setBatchFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editStudent, setEditStudent] = useState<Student | null>(null);
  const [formData, setFormData] = useState({
    registerNumber: '',
    name: '',
    email: '',
    phone: '',
    departmentId: '',
    academicYearId: '',
    batchId: '',
    createAccount: false,
    loginId: '',
    password: '',
  });
  const [saving, setSaving] = useState(false);

  const filteredBatches = batches.filter((b) => {
    if (formData.departmentId && b.departmentId !== formData.departmentId) return false;
    if (formData.academicYearId && b.academicYearId !== formData.academicYearId) return false;
    return true;
  });

  const filteredBatchesForFilter = batches.filter((b) => {
    if (deptFilter && b.departmentId !== deptFilter) return false;
    if (yearFilter && b.academicYearId !== yearFilter) return false;
    return true;
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await studentsApi.getAll({ page, limit: 10, search: search || undefined });
      let filtered = res.data;
      if (deptFilter) filtered = filtered.filter((s) => s.departmentId === deptFilter);
      if (yearFilter) filtered = filtered.filter((s) => s.academicYearId === yearFilter);
      if (batchFilter) filtered = filtered.filter((s) => s.batchId === batchFilter);
      setData({ ...res, data: filtered });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load students');
    } finally {
      setLoading(false);
    }
  }, [page, search, deptFilter, yearFilter, batchFilter]);

  useEffect(() => {
    Promise.all([
      departmentsApi.getAll({ limit: 100 }).then((r) => setDepartments(r.data)),
      academicYearsApi.getAll({ limit: 100 }).then((r) => setAcademicYears(r.data)),
      batchesApi.getAll({ limit: 100 }).then((r) => setBatches(r.data)),
    ]).catch(() => {});
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreate = () => {
    setEditStudent(null);
    setFormData({
      registerNumber: '',
      name: '',
      email: '',
      phone: '',
      departmentId: '',
      academicYearId: '',
      batchId: '',
      createAccount: false,
      loginId: '',
      password: '',
    });
    setShowModal(true);
  };

  const openEdit = (s: Student) => {
    setEditStudent(s);
    setFormData({
      registerNumber: s.registerNumber,
      name: s.user?.name || '',
      email: s.user?.email || '',
      phone: '',
      departmentId: s.departmentId || '',
      academicYearId: s.academicYearId || '',
      batchId: s.batchId,
      createAccount: false,
      loginId: '',
      password: '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      if (editStudent) {
        await studentsApi.update(editStudent.id, {
          registerNumber: formData.registerNumber,
          batchId: formData.batchId,
          departmentId: formData.departmentId || undefined,
          academicYearId: formData.academicYearId || undefined,
        });
      } else {
        await studentsApi.create({
          registerNumber: formData.registerNumber,
          batchId: formData.batchId,
          departmentId: formData.departmentId || undefined,
          academicYearId: formData.academicYearId || undefined,
          userId: undefined,
        });
      }
      setShowModal(false);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save student');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Students</h2>
          <p className="page-subtitle">Manage student records</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Add Student</button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Search by name or register number..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.9rem', width: 250 }}
            />
            <select value={deptFilter} onChange={(e) => { setDeptFilter(e.target.value); setPage(1); }} style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.9rem' }}>
              <option value="">All Departments</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <select value={yearFilter} onChange={(e) => { setYearFilter(e.target.value); setPage(1); }} style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.9rem' }}>
              <option value="">All Years</option>
              {academicYears.map((y) => <option key={y.id} value={y.id}>{y.year}</option>)}
            </select>
            <select value={batchFilter} onChange={(e) => { setBatchFilter(e.target.value); setPage(1); }} style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.9rem' }}>
              <option value="">All Batches</option>
              {filteredBatchesForFilter.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div className="loading-screen"><div className="spinner" /><span>Loading...</span></div>
          ) : !data?.data.length ? (
            <div className="empty-state">No students found</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Register Number</th>
                  <th>Name</th>
                  <th>Department</th>
                  <th>Batch</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((s) => (
                  <tr key={s.id}>
                    <td>{s.registerNumber}</td>
                    <td>{s.user?.name || '-'}</td>
                    <td>{s.department?.name || '-'}</td>
                    <td>{s.batch?.name || '-'}</td>
                    <td>
                      <span className={`badge ${s.isActive ? 'badge-success' : 'badge-danger'}`}>
                        {s.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
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
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editStudent ? 'Edit Student' : 'Create Student'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Register Number</label>
                <input value={formData.registerNumber} onChange={(e) => setFormData({ ...formData, registerNumber: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Name</label>
                <input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Department</label>
                  <select value={formData.departmentId} onChange={(e) => setFormData({ ...formData, departmentId: e.target.value, batchId: '' })}>
                    <option value="">None</option>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Academic Year</label>
                  <select value={formData.academicYearId} onChange={(e) => setFormData({ ...formData, academicYearId: e.target.value, batchId: '' })}>
                    <option value="">None</option>
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
              {!editStudent && (
                <div className="form-group">
                  <label>
                    <input type="checkbox" checked={formData.createAccount} onChange={(e) => setFormData({ ...formData, createAccount: e.target.checked })} style={{ marginRight: 8 }} />
                    Create user account
                  </label>
                </div>
              )}
              {!editStudent && formData.createAccount && (
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
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editStudent ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

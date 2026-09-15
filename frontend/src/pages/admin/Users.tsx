import { useState, useEffect, useCallback } from 'react';
import { usersApi, departmentsApi } from '../../lib/api';
import type { User, Department, PaginatedResponse } from '../../lib/types';

const ROLES = ['ADMIN', 'INTERNAL_TRAINER', 'EXTERNAL_TRAINER', 'STUDENT'];

export default function Users() {
  const [data, setData] = useState<PaginatedResponse<User> | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    loginId: '',
    password: '',
    role: 'STUDENT',
    departmentId: '',
  });
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string | number> = { page, limit: 10 };
      if (search) params.search = search;
      if (roleFilter) params.sortBy = 'role';
      const res = await usersApi.getAll({ page, limit: 10, search: search || undefined });
      let filtered = res.data;
      if (roleFilter) {
        filtered = filtered.filter((u) => u.role?.name === roleFilter);
      }
      setData({ ...res, data: filtered });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [page, search, roleFilter]);

  const fetchDepartments = useCallback(async () => {
    try {
      const res = await departmentsApi.getAll({ limit: 100 });
      setDepartments(res.data);
    } catch {}
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchDepartments(); }, [fetchDepartments]);

  const openCreate = () => {
    setEditUser(null);
    setFormData({ name: '', loginId: '', password: '', role: 'STUDENT', departmentId: '' });
    setShowModal(true);
  };

  const openEdit = (user: User) => {
    setEditUser(user);
    setFormData({
      name: user.name,
      loginId: user.loginId,
      password: '',
      role: user.role?.name || 'STUDENT',
      departmentId: user.departmentId || '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      if (editUser) {
        const payload: Partial<User> = {
          name: formData.name,
          role: { id: '', name: formData.role } as any,
          departmentId: formData.departmentId || undefined,
        };
        await usersApi.update(editUser.id, payload);
      } else {
        await usersApi.create({
          name: formData.name,
          loginId: formData.loginId,
          password: formData.password,
          role: { id: '', name: formData.role } as any,
          departmentId: formData.departmentId || undefined,
        } as any);
      }
      setShowModal(false);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save user');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (user: User) => {
    try {
      await usersApi.toggleStatus(user.id);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to toggle status');
    }
  };

  const roleBadgeClass = (role: string) => {
    switch (role) {
      case 'ADMIN': return 'badge-danger';
      case 'INTERNAL_TRAINER': return 'badge-primary';
      case 'EXTERNAL_TRAINER': return 'badge-info';
      case 'STUDENT': return 'badge-success';
      default: return 'badge-warning';
    }
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Users</h2>
          <p className="page-subtitle">Manage system users</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Add User</button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Search by name or login ID..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.9rem', width: 250 }}
            />
            <select
              value={roleFilter}
              onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
              style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.9rem' }}
            >
              <option value="">All Roles</option>
              {ROLES.map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
            </select>
          </div>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div className="loading-screen"><div className="spinner" /><span>Loading...</span></div>
          ) : !data?.data.length ? (
            <div className="empty-state">No users found</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Login ID</th>
                  <th>Role</th>
                  <th>Department</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((user) => (
                  <tr key={user.id}>
                    <td>{user.name}</td>
                    <td>{user.loginId}</td>
                    <td><span className={`badge ${roleBadgeClass(user.role?.name)}`}>{user.role?.name?.replace('_', ' ')}</span></td>
                    <td>{user.department?.name || '-'}</td>
                    <td>
                      <span className={`badge ${user.isActive ? 'badge-success' : 'badge-danger'}`}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-sm btn-outline" onClick={() => openEdit(user)}>Edit</button>
                        <button
                          className={`btn btn-sm ${user.isActive ? 'btn-danger' : 'btn-success'}`}
                          onClick={() => handleToggleStatus(user)}
                        >
                          {user.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
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
              <h3>{editUser ? 'Edit User' : 'Create User'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Name</label>
                <input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
              </div>
              {!editUser && (
                <>
                  <div className="form-group">
                    <label>Login ID</label>
                    <input value={formData.loginId} onChange={(e) => setFormData({ ...formData, loginId: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Password</label>
                    <input type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} />
                  </div>
                </>
              )}
              <div className="form-group">
                <label>Role</label>
                <select value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })}>
                  {ROLES.map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Department (optional)</label>
                <select value={formData.departmentId} onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}>
                  <option value="">None</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editUser ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

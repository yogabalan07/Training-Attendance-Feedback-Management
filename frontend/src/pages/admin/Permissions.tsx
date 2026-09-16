import { useState, useEffect, useCallback } from 'react';
import { permissionsApi } from '../../lib/api';
import type { Permission, Role } from '../../lib/types';

const PERMISSION_CATEGORIES = ['users', 'students', 'trainers', 'departments', 'academic-years', 'batches', 'sessions', 'trainer-assignments', 'attendance', 'feedback', 'reports', 'permissions', 'audit-logs', 'settings'];

export default function Permissions() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [rolePermissions, setRolePermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [rolesRes, permsRes] = await Promise.all([
        permissionsApi.getRoles(),
        permissionsApi.getAll(),
      ]);
      setRoles(rolesRes);
      setAllPermissions(permsRes);
      if (rolesRes.length > 0 && !selectedRole) {
        setSelectedRole(rolesRes[0].id);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load permissions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!selectedRole) return;
    const role = roles.find((r) => r.id === selectedRole);
    if (role) {
      const perms = allPermissions
        .filter((p) => (role as any).permissions?.some((rp: any) => rp.id === p.id || rp.name === p.name))
        .map((p) => p.name);
      setRolePermissions(perms);
    }
  }, [selectedRole, roles, allPermissions]);

  const handlePermissionToggle = (permName: string) => {
    setRolePermissions((prev) =>
      prev.includes(permName) ? prev.filter((p) => p !== permName) : [...prev, permName]
    );
  };

  const handleCategoryToggle = (category: string) => {
    const categoryPerms = allPermissions
      .filter((p) => p.module === category)
      .map((p) => p.name);
    const allChecked = categoryPerms.every((p) => rolePermissions.includes(p));
    if (allChecked) {
      setRolePermissions((prev) => prev.filter((p) => !categoryPerms.includes(p)));
    } else {
      setRolePermissions((prev) => [...new Set([...prev, ...categoryPerms])]);
    }
  };

  const handleSave = async () => {
    if (!selectedRole) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const permissionIds = allPermissions
        .filter((p) => rolePermissions.includes(p.name))
        .map((p) => p.id);
      await permissionsApi.updateRole(selectedRole, permissionIds);
      setSuccess('Permissions saved successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save permissions');
    } finally {
      setSaving(false);
    }
  };

  const groupedPermissions = PERMISSION_CATEGORIES.map((cat) => ({
    category: cat,
    permissions: allPermissions.filter((p) => p.module === cat),
  })).filter((g) => g.permissions.length > 0);

  if (loading) {
    return <div className="loading-screen"><div className="spinner" /><span>Loading...</span></div>;
  }

  return (
    <div>
      <div className="page-header">
        <h2>Permissions</h2>
        <p className="page-subtitle">Manage role-based permissions</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {roles.map((role) => (
                <button
                  key={role.id}
                  className={`btn btn-sm ${selectedRole === role.id ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setSelectedRole(role.id)}
                >
                  {role.name.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="card-body">
          {groupedPermissions.map(({ category, permissions }) => {
            const allChecked = permissions.every((p) => rolePermissions.includes(p.name));
            const someChecked = permissions.some((p) => rolePermissions.includes(p.name));
            return (
              <div key={category} style={{ marginBottom: 20 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
                    onChange={() => handleCategoryToggle(category)}
                  />
                  <strong style={{ textTransform: 'capitalize' }}>{category.replace('-', ' ')}</strong>
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6, marginLeft: 24 }}>
                  {permissions.map((p) => (
                    <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.85rem' }}>
                      <input
                        type="checkbox"
                        checked={rolePermissions.includes(p.name)}
                        onChange={() => handlePermissionToggle(p.name)}
                      />
                      <span>{p.action}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="card-header">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !selectedRole}>
            {saving ? 'Saving...' : 'Save Permissions'}
          </button>
        </div>
      </div>
    </div>
  );
}

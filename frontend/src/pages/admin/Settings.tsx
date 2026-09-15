import { useState, useEffect, useCallback } from 'react';
import { settingsApi } from '../../lib/api';
import type { SystemSetting } from '../../lib/types';

export default function Settings() {
  const [settings, setSettings] = useState<SystemSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await settingsApi.getAll();
      setSettings(res);
      const values: Record<string, string> = {};
      res.forEach((s) => { values[s.key] = s.value; });
      setEditedValues(values);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleChange = (key: string, value: string) => {
    setEditedValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload = Object.entries(editedValues).map(([key, value]) => {
        const existing = settings.find((s) => s.key === key);
        return { key, value, category: existing?.category, description: existing?.description };
      });
      await settingsApi.update(payload);
      setSuccess('Settings saved successfully');
      setTimeout(() => setSuccess(''), 3000);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const groupedSettings = settings.reduce<Record<string, SystemSetting[]>>((acc, s) => {
    const cat = s.category || 'General';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(s);
    return acc;
  }, {});

  if (loading) {
    return <div className="loading-screen"><div className="spinner" /><span>Loading...</span></div>;
  }

  return (
    <div>
      <div className="page-header">
        <h2>Settings</h2>
        <p className="page-subtitle">Configure system settings</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {Object.entries(groupedSettings).map(([category, items]) => (
        <div className="card" key={category}>
          <div className="card-header">
            <h3 style={{ textTransform: 'capitalize' }}>{category}</h3>
          </div>
          <div className="card-body">
            {items.map((s) => (
              <div className="form-group" key={s.id}>
                <label>{s.description || s.key}</label>
                <input
                  value={editedValues[s.key] || ''}
                  onChange={(e) => handleChange(s.key, e.target.value)}
                  placeholder={s.key}
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn btn-primary btn-lg" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import {
  trainerAssignmentsApi,
  trainersApi,
  academicYearsApi,
  batchesApi,
} from '../../lib/api';
import type {
  TrainerAssignment,
  Trainer,
  AcademicYear,
  Batch,
} from '../../lib/types';

export default function TrainerAssignments() {
  const [assignments, setAssignments] = useState<TrainerAssignment[]>([]);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    trainerId: '',
    batchId: '',
    academicYearId: '',
    subject: '',
    startDate: '',
    endDate: '',
  });

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [assignData, trainerData, yearData, batchData] = await Promise.allSettled([
        trainerAssignmentsApi.getAll(),
        trainersApi.getAll(),
        academicYearsApi.getAll(),
        batchesApi.getAll(),
      ]);
      if (assignData.status === 'fulfilled') setAssignments(assignData.value.data);
      if (trainerData.status === 'fulfilled') setTrainers(trainerData.value.data);
      if (yearData.status === 'fulfilled') setAcademicYears(yearData.value.data);
      if (batchData.status === 'fulfilled') setBatches(batchData.value.data);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await trainerAssignmentsApi.create({
        trainerId: form.trainerId,
        batchId: form.batchId,
        academicYearId: form.academicYearId,
        subject: form.subject || undefined,
        startDate: form.startDate,
        endDate: form.endDate || undefined,
      });
      setShowModal(false);
      setForm({ trainerId: '', batchId: '', academicYearId: '', subject: '', startDate: '', endDate: '' });
      await loadAll();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create assignment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to remove this assignment?')) return;
    try {
      await trainerAssignmentsApi.delete(id);
      setAssignments((prev) => prev.filter((a) => a.id !== id));
    } catch (err: any) {
      console.error('Failed to delete assignment:', err);
    }
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Loading assignments...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Trainer Assignments</h2>
          <p className="page-subtitle">Manage trainer-to-batch assignments</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          + New Assignment
        </button>
      </div>

      <div className="card">
        <div className="card-body">
          {assignments.length === 0 ? (
            <p className="empty-state">No assignments found</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Trainer</th>
                  <th>Batch</th>
                  <th>Department</th>
                  <th>Subject</th>
                  <th>Start Date</th>
                  <th>End Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => (
                  <tr key={a.id}>
                    <td>{a.trainer?.user?.name ?? a.trainerId}</td>
                    <td>{a.batch?.name ?? a.batchId}</td>
                    <td>{a.batch?.department?.name ?? '-'}</td>
                    <td>{a.subject ?? '-'}</td>
                    <td>{new Date(a.startDate).toLocaleDateString()}</td>
                    <td>{a.endDate ? new Date(a.endDate).toLocaleDateString() : '-'}</td>
                    <td>
                      <span className={`badge ${a.isActive ? 'badge-success' : 'badge-danger'}`}>
                        {a.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleDelete(a.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Create Assignment</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                &times;
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && <div className="alert alert-error">{error}</div>}
                <div className="form-group">
                  <label>External Trainer *</label>
                  <select
                    value={form.trainerId}
                    onChange={(e) => setForm({ ...form, trainerId: e.target.value })}
                    required
                  >
                    <option value="">Select trainer</option>
                    {trainers
                      .filter((t) => t.isExternal)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.user?.name} ({t.employeeId})
                        </option>
                      ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Batch *</label>
                  <select
                    value={form.batchId}
                    onChange={(e) => setForm({ ...form, batchId: e.target.value })}
                    required
                  >
                    <option value="">Select batch</option>
                    {batches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Academic Year *</label>
                  <select
                    value={form.academicYearId}
                    onChange={(e) => setForm({ ...form, academicYearId: e.target.value })}
                    required
                  >
                    <option value="">Select academic year</option>
                    {academicYears.map((y) => (
                      <option key={y.id} value={y.id}>
                        {y.year}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Subject</label>
                  <input
                    type="text"
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    placeholder="e.g. Data Structures"
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Start Date *</label>
                    <input
                      type="date"
                      value={form.startDate}
                      onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>End Date</label>
                    <input
                      type="date"
                      value={form.endDate}
                      onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Creating...' : 'Create Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

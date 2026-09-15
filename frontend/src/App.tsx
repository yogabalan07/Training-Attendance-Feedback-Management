import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

import TrainerDashboard from './pages/trainer/TrainerDashboard';
import TrainerAssignments from './pages/trainer/TrainerAssignments';
import TrainerMySessions from './pages/trainer/MySessions';
import AttendanceMarking from './pages/trainer/AttendanceMarking';

import StudentDashboard from './pages/student/StudentDashboard';
import StudentMySessions from './pages/student/MySessions';
import StudentMyAttendance from './pages/student/MyAttendance';
import FeedbackForm from './pages/student/FeedbackForm';

import Reports from './pages/reports/Reports';

import AdminUsers from './pages/admin/Users';
import AdminStudents from './pages/admin/Students';
import AdminTrainers from './pages/admin/Trainers';
import AdminDepartments from './pages/admin/Departments';
import AdminAcademicYears from './pages/admin/AcademicYears';
import AdminBatches from './pages/admin/Batches';
import AdminSessions from './pages/admin/Sessions';
import AdminTrainerAssignments from './pages/admin/TrainerAssignments';
import AdminPermissions from './pages/admin/Permissions';
import AdminAuditLogs from './pages/admin/AuditLogs';
import AdminSettings from './pages/admin/Settings';
import AttendanceManagement from './pages/admin/AttendanceManagement';
import FeedbackManagement from './pages/admin/FeedbackManagement';

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout>
              <Navigate to="/dashboard" replace />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Layout>
              <Dashboard />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/users"
        element={
          <ProtectedRoute roles={['ADMIN']}>
            <Layout>
              <AdminUsers />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/students"
        element={
          <ProtectedRoute roles={['ADMIN']}>
            <Layout>
              <AdminStudents />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/trainers"
        element={
          <ProtectedRoute roles={['ADMIN']}>
            <Layout>
              <AdminTrainers />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/departments"
        element={
          <ProtectedRoute roles={['ADMIN']}>
            <Layout>
              <AdminDepartments />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/academic-years"
        element={
          <ProtectedRoute roles={['ADMIN']}>
            <Layout>
              <AdminAcademicYears />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/batches"
        element={
          <ProtectedRoute roles={['ADMIN']}>
            <Layout>
              <AdminBatches />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/sessions"
        element={
          <ProtectedRoute roles={['ADMIN', 'INTERNAL_TRAINER']}>
            <Layout>
              <AdminSessions />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/my-sessions"
        element={
          <ProtectedRoute roles={['EXTERNAL_TRAINER', 'INTERNAL_TRAINER']}>
            <Layout>
              <TrainerMySessions />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/my-sessions/student"
        element={
          <ProtectedRoute roles={['STUDENT']}>
            <Layout>
              <StudentMySessions />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/assignments"
        element={
          <ProtectedRoute roles={['ADMIN']}>
            <Layout>
              <AdminTrainerAssignments />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/my-assignments"
        element={
          <ProtectedRoute roles={['EXTERNAL_TRAINER', 'INTERNAL_TRAINER']}>
            <Layout>
              <TrainerAssignments />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/trainer-dashboard"
        element={
          <ProtectedRoute roles={['INTERNAL_TRAINER', 'EXTERNAL_TRAINER']}>
            <Layout>
              <TrainerDashboard />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/student-dashboard"
        element={
          <ProtectedRoute roles={['STUDENT']}>
            <Layout>
              <StudentDashboard />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/attendance-mark/:sessionId"
        element={
          <ProtectedRoute roles={['ADMIN', 'INTERNAL_TRAINER', 'EXTERNAL_TRAINER']}>
            <Layout>
              <AttendanceMarking />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/attendance"
        element={
          <ProtectedRoute roles={['ADMIN', 'INTERNAL_TRAINER']}>
            <Layout>
              <AttendanceManagement />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/my-attendance"
        element={
          <ProtectedRoute roles={['STUDENT']}>
            <Layout>
              <StudentMyAttendance />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/feedback"
        element={
          <ProtectedRoute roles={['ADMIN', 'INTERNAL_TRAINER']}>
            <Layout>
              <FeedbackManagement />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/give-feedback/:sessionId"
        element={
          <ProtectedRoute roles={['STUDENT']}>
            <Layout>
              <FeedbackForm />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/reports"
        element={
          <ProtectedRoute roles={['ADMIN', 'INTERNAL_TRAINER']}>
            <Layout>
              <Reports />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/permissions"
        element={
          <ProtectedRoute roles={['ADMIN']}>
            <Layout>
              <AdminPermissions />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/audit-logs"
        element={
          <ProtectedRoute roles={['ADMIN']}>
            <Layout>
              <AdminAuditLogs />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/settings"
        element={
          <ProtectedRoute roles={['ADMIN']}>
            <Layout>
              <AdminSettings />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  permissions?: string[];
  roles?: string[];
}

export default function ProtectedRoute({ children, permissions, roles }: ProtectedRouteProps) {
  const { user, loading, hasPermission, hasRole } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (roles && roles.length > 0 && !roles.some((role) => hasRole(role))) {
    return <Navigate to="/dashboard" replace />;
  }

  if (permissions && permissions.length > 0 && !permissions.some((perm) => hasPermission(perm))) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

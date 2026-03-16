import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';

const ProtectedRoute: React.FC = () => {
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    // Redirect to login page instead of landing page
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;

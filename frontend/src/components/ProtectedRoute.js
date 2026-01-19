import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import AccessDenied from './AccessDenied';

/**
 * ProtectedRoute: Restricts access to children based on authentication and role.
 * @param {ReactNode} children
 * @param {string|string[]} requiredRoles
 */
const ProtectedRoute = ({ children, requiredRoles }) => {
  const { isAuthenticated, isGuest, loading, role } = useAuth();
  if (loading) return null;
  // allow guests through — only redirect unauthenticated non-guests to login
  if (!isAuthenticated && !isGuest) return <Navigate to="/login" replace />;

  if (requiredRoles) {
    const roles = [...(Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles])];
    if (isGuest) {
      if (!roles.includes('guest')) return <AccessDenied />;
    } else {
      if (!roles.includes(role)) return <AccessDenied />;
    }
  }

  return children;
};

export default ProtectedRoute;

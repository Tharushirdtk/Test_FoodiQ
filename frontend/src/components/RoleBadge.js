import React from 'react';
import { useAuth } from '../context/AuthContext';

const RoleBadge = () => {
  const { role } = useAuth();
  if (!role) return null;
  // Do not show role tag for customers
  if (role === 'customer') return null;
  const colorMap = {
    admin: '#d32f2f',
    vendor: '#1976d2',
    driver: '#388e3c',
    support: '#fbc02d',
    customer: '#616161',
  };
  return (
    <span style={{
      display: 'block',
      background: colorMap[role] || '#888',
      color: 'var(--text-on-primary, #fff)',
      borderRadius: 12,
      padding: '6px 12px',
      fontSize: 13,
      margin: '6px auto 4px',
      width: 'max-content',
      fontWeight: 700,
      textAlign: 'center',
      boxShadow: '0 2px 6px rgba(0,0,0,0.08)'
    }}>
      {role.charAt(0).toUpperCase() + role.slice(1)}
    </span>
  );
};

export default RoleBadge;

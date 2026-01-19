import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/SubPage.css';

const AccessDenied = ({
  message = "You don't have access to this page.",
  actionLabel = 'Go to Home',
  actionPath = '/',
}) => {
  const navigate = useNavigate();
  return (
    <div className="sub-page">
      <header className="sub-header">
        <h1>Access Denied</h1>
      </header>

      <div className="sub-content" style={{ minHeight: 'calc(100vh - var(--header-height,64px) - var(--bottom-nav-height,64px))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="empty-state">
          <div className="empty-icon">🚫</div>
          <h3>{message}</h3>
          <p style={{ color: 'var(--text-gray)' }}>
            If you think this is an error, contact support or sign in with an account
            that has the required permissions.
          </p>
          <button className="btn" onClick={() => navigate(actionPath)}>
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AccessDenied;

import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/SubPage.css';

const NotFound = () => {
  const navigate = useNavigate();
  return (
    <div className="sub-page">
      <header className="sub-header">
        <h1>Page Not Found</h1>
      </header>

      <div className="sub-content" style={{ minHeight: 'calc(100vh - var(--header-height,64px) - var(--bottom-nav-height,64px))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="empty-state">
          <div className="empty-icon">🔎</div>
          <h3>We couldn't find that page</h3>
          <p style={{ color: 'var(--text-gray)' }}>
            The page you are looking for doesn't exist or has been moved.
          </p>
          <button className="btn" onClick={() => navigate('/')}>Go to Home</button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;

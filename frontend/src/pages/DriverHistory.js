import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft } from 'react-icons/fi';
import NotificationsButton from '../components/NotificationsButton';
import QuickNavSidebar from '../components/QuickNavSidebar';
import orderService from '../services/orderService';
import '../styles/SubPage.css';
import '../styles/DriverHistory.css';

const DriverHistory = () => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        setLoading(true);
        const assigned = await orderService.getDriverHistory();
        if (!mounted) return;
        setHistory(Array.isArray(assigned) ? assigned : []);
      } catch (e) {
        setHistory([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  return (
    <div className="sub-page driver-history">
      <header className="sub-header">
        <button className="back-btn" onClick={() => navigate('/account')}>
          <FiArrowLeft size={24} />
        </button>
        <h1>Assigned Orders History</h1>
        <div style={{ marginLeft: 'auto' }}>
          <NotificationsButton />
        </div>
      </header>

      <div className="sub-content">
        <div className="info-section">
          {loading ? (
            <div className="loading-spinner-container">
              <div className="loading-spinner"></div>
            </div>
          ) : history.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📦</div>
              <h3>No history yet</h3>
              <p>You don't have any completed or assigned orders at the moment.</p>
            </div>
          ) : (
            <div className="history-cards">
              {history.map(o => (
                <div key={o._id} className="history-card">
                  <div className="history-card-row">
                    <div className="history-card-title">#{String(o._id).slice(-6).toUpperCase()}</div>
                    <div className="history-card-badge">{o.status}</div>
                  </div>
                  <div className="history-card-meta">Items: {o.items ? o.items.length : 0} • Total: Rs {o.total || 0}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <QuickNavSidebar />
    </div>
  );
};

export default DriverHistory;

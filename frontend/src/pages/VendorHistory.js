import React, { useEffect, useState } from 'react';
import api from '../utils/apiClient';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft } from 'react-icons/fi';
import NotificationsButton from '../components/NotificationsButton';
import QuickNavSidebar from '../components/QuickNavSidebar';

export default function VendorHistory() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const API = process.env.REACT_APP_API_URL || 'http://localhost:5000';

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Use shared `api` client so auth token is attached automatically
        const res = await api.get(`/vendors/${user._id}/orders`);
        if (!mounted) return;
        setOrders(res.data?.orders || res.orders || []);
      } catch (e) {
        console.error('Failed to load vendor orders', e);
      } finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, [user._id, API]);

  const navigate = useNavigate();

  if (loading) return <div className="sub-page"><LoadingSpinner /></div>;

  return (
    <div className="sub-page vendor-history">
      <header className="sub-header">
        <button className="back-btn" onClick={() => navigate('/account')}>
          <FiArrowLeft size={24} />
        </button>
        <h1>Vendor History</h1>
        <div style={{ marginLeft: 'auto' }}>
          <NotificationsButton />
        </div>
      </header>

      <div className="sub-content">
        <div className="info-section">
          {orders.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🏪</div>
              <h3>No vendor sales found yet.</h3>
              <p>Your store will show orders including your items here.</p>
            </div>
          ) : (
            <div className="history-cards">
              {orders.map(o => (
                <div key={o._id} className="history-card">
                  <div className="history-card-row">
                    <div className="history-card-title">#{String(o._id).slice(-6).toUpperCase()}</div>
                    <div className="history-card-badge">Rs {o.total}</div>
                  </div>
                  <div className="history-card-meta">{new Date(o.createdAt).toLocaleString()} • Items: {o.items ? o.items.length : 0}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <QuickNavSidebar />
    </div>
  );
}

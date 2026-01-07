import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft } from 'react-icons/fi';
import orderService from '../services/orderService';
import QuickNavSidebar from '../components/QuickNavSidebar';
import '../styles/SubPage.css';

const OrdersPage = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('all');

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const data = await orderService.getOrders();
      setOrders(data || []);
    } catch (err) {
      setError('Failed to load orders');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filteredOrders = orders.filter(order => {
    if (activeTab === 'all') return true;
    if (activeTab === 'active') return ['pending', 'confirmed', 'preparing', 'delivering', 'ready'].includes(order.status);
    if (activeTab === 'completed') return order.status === 'delivered';
    if (activeTab === 'cancelled') return order.status === 'cancelled';
    return true;
  });

  const getStatusBadge = (status) => {
    const statusMap = {
      pending: { label: 'Pending', class: 'pending' },
      confirmed: { label: 'Confirmed', class: 'pending' },
      preparing: { label: 'Preparing', class: 'pending' },
      ready: { label: 'Ready', class: 'pending' },
      delivering: { label: 'On the way', class: 'pending' },
      delivered: { label: 'Delivered', class: 'completed' },
      cancelled: { label: 'Cancelled', class: 'cancelled' }
    };
    return statusMap[status] || { label: status, class: 'pending' };
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getOrderTotal = (order) => {
    if (!order || !Array.isArray(order.items)) return 0;
    return order.items.reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.quantity) || 1), 0);
  };

  return (
    <div className="sub-page">
      <header className="sub-header">
        <button className="back-btn" onClick={() => navigate('/account')}>
          <FiArrowLeft size={24} />
        </button>
        <h1>My Orders</h1>
      </header>

      <div className="sub-content">
        {/* Tabs */}
        <div className="tabs">
          <button 
            className={`tab ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            All
          </button>
          <button 
            className={`tab ${activeTab === 'active' ? 'active' : ''}`}
            onClick={() => setActiveTab('active')}
          >
            Active
          </button>
          <button 
            className={`tab ${activeTab === 'completed' ? 'active' : ''}`}
            onClick={() => setActiveTab('completed')}
          >
            Completed
          </button>
          <button 
            className={`tab ${activeTab === 'cancelled' ? 'active' : ''}`}
            onClick={() => setActiveTab('cancelled')}
          >
            Cancelled
          </button>
        </div>

        {loading ? (
          <div className="loading-spinner-container">
            <div className="loading-spinner"></div>
          </div>
        ) : error ? (
          <div className="error-message">{error}</div>
        ) : filteredOrders.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📦</div>
            <h3>No orders yet</h3>
            <p>When you place orders, they'll appear here</p>
            <button className="btn" onClick={() => navigate('/store')}>
              Browse Menu
            </button>
          </div>
        ) : (
          <div className="card-list">
            {filteredOrders.map(order => {
              const status = getStatusBadge(order.status);
              return (
                <div 
                  key={order._id} 
                  className="card-item"
                  onClick={() => navigate(`/order/${order._id}`)}
                >
                  <div className="card-header">
                    <h3 className="card-title">Order #{order._id?.slice(-6).toUpperCase()}</h3>
                    <span className={`card-badge ${status.class}`}>{status.label}</span>
                  </div>
                  <div className="card-body">
                    <p>{order.items?.length || 0} items</p>
                    {order.items?.slice(0, 2).map((item, idx) => (
                      <p key={idx} style={{ fontSize: 13, color: 'var(--text-light)' }}>
                        • {item.name} x{item.quantity}
                      </p>
                    ))}
                    {order.items?.length > 2 && (
                      <p style={{ fontSize: 13, color: 'var(--text-light)' }}>
                        +{order.items.length - 2} more items
                      </p>
                    )}
                  </div>
                  <div className="card-footer">
                    <span className="card-price">Rs. {getOrderTotal(order).toLocaleString()}</span>
                    <span className="card-date">{formatDate(order.createdAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom navigation is now rendered globally in App.js */}
      
      {/* Quick Navigation Sidebar */}
      <QuickNavSidebar />
    </div>
  );
};

export default OrdersPage;

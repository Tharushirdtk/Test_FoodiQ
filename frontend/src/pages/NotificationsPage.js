import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiBell, FiPackage, FiTag, FiInfo, FiSettings, FiTrash2, FiCheck } from 'react-icons/fi';
import { useNotifications } from '../context/NotificationsContext';
import { useAuth } from '../context/AuthContext';
import QuickNavSidebar from '../components/QuickNavSidebar';
import { useToast } from '../context/ToastContext';
import '../styles/SubPage.css';
import ConfirmDialog from '../components/ConfirmDialog';

const NotificationsPage = () => {
  const navigate = useNavigate();
  const { notifications, loading, markRead, markAllRead, deleteNotification, unreadCount } = useNotifications();
  const { role } = useAuth();
  const [error, setError] = useState(null);
  const toast = useToast();
  const [deletingIds, setDeletingIds] = useState([]);

  const getIcon = (type) => {
    const icons = {
      order: <FiPackage size={20} />,
      promo: <FiTag size={20} />,
      system: <FiSettings size={20} />,
      info: <FiInfo size={20} />
    };
    return icons[type] || <FiBell size={20} />;
  };

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };


  const handleMarkAllRead = async () => {
    try {
      await markAllRead();
      setError(null);
    } catch (err) {
      setError('Failed to mark all as read');
    }
  };

  const handleDelete = async (id) => {
    if (!id) return;
    try {
      setDeletingIds(prev => [...prev, id]);
      await deleteNotification(id);
      setError(null);
      toast && toast.showToast && toast.showToast('Notification deleted', { type: 'default', duration: 2000 });
    } catch (err) {
      console.error('delete failed', err);
      setError(err?.response?.data?.message || 'Failed to delete notification');
      toast && toast.showToast && toast.showToast('Delete failed', { type: 'error', duration: 4000 });
    } finally {
      setDeletingIds(prev => prev.filter(i => i !== id));
    }
  };

  const handleItemClick = async (n) => {
    try {
      const convId = n?.data?.conversationId || (n?.data && n.data.conversation && n.data.conversation._id) || null;
      const orderRef = n?.data?.orderId || n?.data?.order || (n?.data && n.data.order && n.data.order._id) || null;
      const noteType = n?.data?.type || (orderRef ? 'order' : (convId ? 'support' : undefined));

      const oid = orderRef || (n?.data && n.data.order && n.data.order._id) || null;
      const orderStatusTypes = new Set([
        'order_placed','order_confirmed','preparing_your_meal','ready_for_pickup','driver_assigned','out_for_delivery','order_picked_up','delivered','cancelled',
        'vendor_preparing','vendor_ready','vendor_picked',
        'order_cancelled','order_unassigned'
      ]);

      if (oid && noteType && orderStatusTypes.has(noteType)) {
        if (!n.read) await markRead(n._id);
        if (oid) navigate(`/order/${oid}`);
        return;
      }

      if (noteType === 'order' || orderRef) {
        if (!n.read) await markRead(n._id);
        if (oid) {
          const path = convId ? `/order/${oid}/chat?conversationId=${convId}` : `/order/${oid}/chat`;
          navigate(path);
        } else if (convId) {
          navigate(`/support/chat/${convId}`);
        }
        return;
      }

      if (noteType === 'support' || convId) {
        if (!n.read) await markRead(n._id);
        if (role === 'support' || role === 'admin') navigate(`/support/chat/${convId}`);
        else navigate('/support/chat');
        return;
      }

      if (n?.data?.type && (n.data.type === 'rate_vendor' || n.data.type === 'vendor_ready') && (n.data.vendor || n.data.vendorId)) {
        const vendorId = n.data.vendor || n.data.vendorId;
        const orderId = n?.data?.orderId;
        if (!n.read) await markRead(n._id);
        if (orderId) navigate(`/order/${orderId}?openVendor=${vendorId}`);
        else if (n.data.path) navigate(n.data.path);
        return;
      }

      if (n?.data?.type === 'rate_driver' && n?.data?.driver) {
        const orderId = n?.data?.orderId;
        const driverId = n.data.driver;
        if (!n.read) await markRead(n._id);
        if (orderId) navigate(`/order/${orderId}?openDriver=${driverId}`);
        else if (n.data.path) navigate(n.data.path);
        return;
      }

      if (n?.data?.type === 'rate_product' && (n?.data?.product || n?.data?.productId)) {
        const pid = n.data.product || n.data.productId;
        const orderId = n?.data?.orderId;
        if (!n.read) await markRead(n._id);
        let path = `/product/${pid}`;
        if (orderId) path += `?orderId=${orderId}&openRate=1`;
        else path += `?openRate=1`;
        navigate(path);
        return;
      }

      if (n?.data?.type === 'vendor_rate_driver' && n?.data?.driver) {
        const orderId = n?.data?.orderId;
        const driverId = n.data.driver;
        if (!n.read) await markRead(n._id);
        if (orderId) navigate(`/order/${orderId}?openDriver=${driverId}`);
        else if (n.data.path) navigate(n.data.path);
        return;
      }

      if (n?.data?.type === 'driver_rate_vendors' && Array.isArray(n?.data?.vendors) && n.data.vendors.length > 0) {
        const orderId = n?.data?.orderId;
        const vendorId = n.data.vendors[0];
        if (!n.read) await markRead(n._id);
        if (orderId) navigate(`/order/${orderId}?openVendor=${vendorId}`);
        else if (n.data.path) navigate(n.data.path);
        return;
      }

      const orderId = n?.data?.orderId || (n?.data?.order && n.data.order._id) || null;
      if (orderId) {
        if (!n.read) await markRead(n._id);
        navigate(`/order/${orderId}`);
        return;
      }

      if (n?.data?.path) {
        if (!n.read) await markRead(n._id);
        navigate(n.data.path);
        return;
      }

      if (!n.read) await markRead(n._id);
    } catch (e) {
      console.error('handleItemClick', e);
    }
  };

  const handleClearAll = async () => {
    // open confirm dialog (handled in UI)
    if (!notifications || notifications.length === 0) return;
    setShowClearConfirm(true);
  };

  const [showClearConfirm, setShowClearConfirm] = React.useState(false);

  const confirmClearAll = async () => {
    try {
      for (const n of notifications.slice()) {
        // eslint-disable-next-line no-await-in-loop
        await deleteNotification(n._id);
      }
      setError(null);
      setShowClearConfirm(false);
    } catch (err) {
      setError('Failed to clear notifications');
    }
  };

  useEffect(() => {
    // clear any lingering errors when the page is opened
    setError(null);
  }, []);

  // unreadCount is provided by the notifications context

  return (
    <div className="sub-page notifications-page">
      <header className="sub-header">
        <button className="back-btn" onClick={() => navigate('/account')}>
          <FiArrowLeft size={24} />
        </button>
        <h1>Notifications</h1>
        {notifications && notifications.length > 0 && (
          <button className="header-action" onClick={handleClearAll}>
            <FiTrash2 size={18} />
          </button>
        )}
      </header>

      <div className="sub-content">
        {error && <div className="error-message">{error}</div>}

        {/* Mark All Read */}
        {unreadCount > 0 && (
          <button 
            onClick={handleMarkAllRead}
            style={{
              width: '100%',
              padding: '12px',
              marginBottom: 16,
              background: 'var(--bg-white)',
              border: '1px solid var(--border-color)',
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              color: 'var(--primary-color)',
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer'
            }}
          >
            <FiCheck size={18} />
            Mark all as read ({unreadCount})
          </button>
        )}

        {loading ? (
          <div className="loading-spinner-container">
            <div className="loading-spinner"></div>
          </div>
        ) : !notifications || notifications.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🔔</div>
            <h3>No notifications</h3>
            <p>You're all caught up! We'll notify you when there's something new.</p>
          </div>
        ) : (
          <>
            {/* Unread / New notifications row (only if any) */}
            {notifications && notifications.filter(n => !n.read).length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ margin: '8px 0 12px', fontSize: 16 }}>New</h3>
                <div className="card-list">
                  {notifications.filter(n => !n.read).map(notification => (
                    <div 
                      key={notification._id} 
                      className={`notification-item ${!notification.read ? 'unread' : ''}`}
                      onClick={() => handleItemClick(notification)}
                    >
                      <div className={`notification-icon ${notification.type}`}>
                        {getIcon(notification.type)}
                      </div>
                      <div className="notification-content">
                        <h4 className="notification-title">{notification.title}</h4>
                        <p className="notification-message">{notification.body || notification.message || ''}</p>
                        <span className="notification-time">{formatTime(notification.createdAt)}</span>
                      </div>
                      <button 
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleDelete(notification._id); }}
                        disabled={deletingIds.includes(notification._id)}
                        aria-label="Delete notification"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: deletingIds.includes(notification._id) ? 'var(--text-muted)' : 'var(--text-light)',
                          cursor: deletingIds.includes(notification._id) ? 'not-allowed' : 'pointer',
                          padding: 8
                        }}
                      >
                        <FiTrash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Read / Older notifications row (only if any) */}
            {notifications && notifications.filter(n => n.read).length > 0 && (
              <div>
                <h3 style={{ margin: '8px 0 12px', fontSize: 16 }}>Read</h3>
                <div className="card-list">
                  {notifications.filter(n => n.read).map(notification => (
                    <div 
                      key={notification._id} 
                      className={`notification-item ${!notification.read ? 'unread' : ''}`}
                      onClick={() => handleItemClick(notification)}
                    >
                      <div className={`notification-icon ${notification.type}`}>
                        {getIcon(notification.type)}
                      </div>
                      <div className="notification-content">
                        <h4 className="notification-title">{notification.title}</h4>
                        <p className="notification-message">{notification.body || notification.message || ''}</p>
                        <span className="notification-time">{formatTime(notification.createdAt)}</span>
                      </div>
                      <button 
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleDelete(notification._id); }}
                        disabled={deletingIds.includes(notification._id)}
                        aria-label="Delete notification"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: deletingIds.includes(notification._id) ? 'var(--text-muted)' : 'var(--text-light)',
                          cursor: deletingIds.includes(notification._id) ? 'not-allowed' : 'pointer',
                          padding: 8
                        }}
                      >
                        <FiTrash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={confirmClearAll}
        title={`Clear all notifications (${notifications ? notifications.length : 0})`}
        message="This will permanently delete all notifications. This action cannot be undone."
        confirmText="Clear all"
        cancelText="Cancel"
        variant="danger"
      />

      {/* Bottom navigation is now rendered globally in App.js */}
      
      {/* Quick Navigation Sidebar */}
      <QuickNavSidebar />
    </div>
  );
};

export default NotificationsPage;

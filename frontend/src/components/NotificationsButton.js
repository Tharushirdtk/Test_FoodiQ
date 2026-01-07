import React, { useState, useRef, useEffect } from 'react';
import { FiBell, FiChevronRight } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../context/NotificationsContext';

const dropdownStyle = {
  position: 'absolute',
  right: 0,
  top: '44px',
  width: 420,
  maxWidth: '92vw',
  minHeight: 360,
  maxHeight: 560,
  overflowY: 'auto',
  background: 'var(--bg-white)',
  boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
  borderRadius: 10,
  zIndex: 12000,
  padding: 10
};

const NotificationsButton = ({ compact }) => {
  const { notifications = [], unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef();
  const navigate = useNavigate();

  useEffect(() => {
    const onDoc = (e) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  const latest = (notifications || []).filter(n => !n.read).slice(0, 6);

  const handleItemClick = async (n) => {
    try {
      // If this notification references an order, navigate to that order page
      const orderId = n?.data?.orderId || (n?.data?.order && n.data.order._id) || null;
      if (orderId) {
        // mark read then navigate and close
        if (!n.read) await markRead(n._id);
        setOpen(false);
        navigate(`/order/${orderId}`);
        return;
      }

      if (n?.data?.path) {
        if (!n.read) await markRead(n._id);
        setOpen(false);
        navigate(n.data.path);
        return;
      }

      // Otherwise, mark as read but keep the dropdown open (per request)
      if (!n.read) await markRead(n._id);
      // provider will update notifications; no need to call refresh()
    } catch (e) {
      console.error('handleItemClick', e);
    }
  };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        className="btn btn-icon"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        title="Notifications"
        style={{ position: 'relative' }}
      >
        <FiBell size={20} />
        {unreadCount > 0 && (
          <span className="notif-badge" style={{
            position: 'absolute',
            right: -2,
            top: -2,
            background: 'var(--accent-color, #FF4D4F)',
            color: '#fff',
            borderRadius: 999,
            padding: '2px 6px',
            fontSize: 11,
            fontWeight: 700,
            lineHeight: 1
          }}>{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div style={dropdownStyle} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px' }}>
            <strong>Notifications</strong>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {unreadCount > 0 && (
                <button className="btn btn-link" onClick={() => markAllRead()} style={{ fontSize: 13 }}>Mark all</button>
              )}
              <button className="btn btn-link" onClick={() => { setOpen(false); navigate('/account/notifications'); }} style={{ fontSize: 13 }}>View all</button>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border-color)', marginTop: 8, paddingTop: 8 }}>
            {latest.length === 0 && (
              <div style={{ padding: 12, textAlign: 'center', color: 'var(--text-muted)' }}>No notifications</div>
            )}
            {latest.map(n => (
              <div key={n._id} onClick={() => handleItemClick(n)} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px', borderRadius: 6, cursor: 'pointer', background: n.read ? 'transparent' : 'rgba(0,0,0,0.03)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{n.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(n.createdAt).toLocaleTimeString()}</div>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{n.body || n.message || ''}</div>
                </div>
                <div style={{ alignSelf: 'center' }}>
                  <FiChevronRight size={18} color="#888" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationsButton;

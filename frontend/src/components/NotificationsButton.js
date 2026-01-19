import React, { useState, useRef, useEffect } from 'react';
import { FiBell, FiChevronRight } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../context/NotificationsContext';
import { useAuth } from '../context/AuthContext';
import '../styles/NotificationsButton.css';

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
  const { role } = useAuth();
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

  const latest = (notifications || []).filter(n => !n.read);

  const handleItemClick = async (n) => {
    try {
      // If this notification references a support conversation, navigate there
      const convId = n?.data?.conversationId || (n?.data && n.data.conversation && n.data.conversation._id) || null;
      const orderRef = n?.data?.orderId || n?.data?.order || (n?.data && n.data.order && n.data.order._id) || null;
      const noteType = n?.data?.type || (orderRef ? 'order' : (convId ? 'support' : undefined));

      // If this is an order status notification, take the user to order tracking
      const oid = orderRef || (n?.data && n.data.order && n.data.order._id) || null;
      const orderStatusTypes = new Set([
        'order_placed','order_confirmed','preparing_your_meal','ready_for_pickup','driver_assigned','out_for_delivery','order_picked_up','delivered','cancelled',
        'vendor_preparing','vendor_ready','vendor_picked',
        // backend uses 'order_cancelled' for cancellation notifications
        'order_cancelled'
        , 'order_unassigned'
      ]);
      if (oid && noteType && orderStatusTypes.has(noteType)) {
        if (!n.read) await markRead(n._id);
        setOpen(false);
        navigate(`/order/${oid}`);
        return;
      }

      // If this is an order-related chat notification, open the order chat page
      if (noteType === 'order' || orderRef) {
        if (!n.read) await markRead(n._id);
        setOpen(false);
        if (oid) {
          // navigate to order chat and include conversation id when available
          const path = convId ? `/order/${oid}/chat?conversationId=${convId}` : `/order/${oid}/chat`;
          navigate(path);
        } else if (convId) {
          // fallback: if we only have a conversation id, try opening support chat conversation
          navigate(`/support/chat/${convId}`);
        }
        return;
      }

      // If this notification references a support conversation, navigate there
      if (noteType === 'support' || convId) {
        if (!n.read) await markRead(n._id);
        setOpen(false);
        // customers -> generic support chat, support/admin -> specific conversation
        if (role === 'support' || role === 'admin') navigate(`/support/chat/${convId}`);
        else navigate('/support/chat');
        return;
      }
      // If this notification is a rate_vendor or vendor_ready action, open the order page and auto-open vendor modal
      if (n?.data?.type && (n.data.type === 'rate_vendor' || n.data.type === 'vendor_ready') && (n.data.vendor || n.data.vendorId)) {
        const vendorId = n.data.vendor || n.data.vendorId;
        const orderId = n?.data?.orderId;
        if (!n.read) await markRead(n._id);
        setOpen(false);
        if (orderId) navigate(`/order/${orderId}?openVendor=${vendorId}`);
        else if (n.data.path) navigate(n.data.path);
        return;
      }
      // rate_driver: open order page and auto-open driver modal
      if (n?.data?.type === 'rate_driver' && n?.data?.driver) {
        const orderId = n?.data?.orderId;
        const driverId = n.data.driver;
        if (!n.read) await markRead(n._id);
        setOpen(false);
        if (orderId) navigate(`/order/${orderId}?openDriver=${driverId}`);
        else if (n.data.path) navigate(n.data.path);
        return;
      }

      // rate_product: navigate to product page and open rate modal
      if (n?.data?.type === 'rate_product' && (n?.data?.product || n?.data?.productId)) {
        const pid = n.data.product || n.data.productId;
        const orderId = n?.data?.orderId;
        if (!n.read) await markRead(n._id);
        setOpen(false);
        let path = `/product/${pid}`;
        if (orderId) path += `?orderId=${orderId}&openRate=1`;
        else path += `?openRate=1`;
        navigate(path);
        return;
      }

      // vendor_rate_driver: vendor should open the driver modal for the order
      if (n?.data?.type === 'vendor_rate_driver' && n?.data?.driver) {
        const orderId = n?.data?.orderId;
        const driverId = n.data.driver;
        if (!n.read) await markRead(n._id);
        setOpen(false);
        if (orderId) navigate(`/order/${orderId}?openDriver=${driverId}`);
        else if (n.data.path) navigate(n.data.path);
        return;
      }

      // driver_rate_vendors: driver should open order and the first vendor modal
      if (n?.data?.type === 'driver_rate_vendors' && Array.isArray(n?.data?.vendors) && n.data.vendors.length > 0) {
        const orderId = n?.data?.orderId;
        const vendorId = n.data.vendors[0];
        if (!n.read) await markRead(n._id);
        setOpen(false);
        if (orderId) navigate(`/order/${orderId}?openVendor=${vendorId}`);
        else if (n.data.path) navigate(n.data.path);
        return;
      }
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
            color: 'var(--text-on-primary, #fff)',
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
            <div className="notifications-list" style={{ WebkitOverflowScrolling: 'touch' }}>
              {latest.length === 0 && (
                <div style={{ padding: 12, textAlign: 'center', color: 'var(--text-muted)' }}>No notifications</div>
              )}
              {latest.map(n => (
                <div key={n._id} onClick={() => handleItemClick(n)} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px', borderRadius: 6, cursor: 'pointer', background: n.read ? 'transparent' : 'rgba(0,0,0,0.03)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{n.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{n.body || n.message || ''}</div>
                  </div>
                    <div style={{ alignSelf: 'center' }}>
                    <FiChevronRight size={18} color={"var(--text-muted, #888)"} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationsButton;

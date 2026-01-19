import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import notificationsService from '../services/notificationsService';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

const NotificationsContext = createContext(null);

export const useNotifications = () => {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider');
  return ctx;
};

export const NotificationsProvider = ({ children }) => {
  const { on } = useSocket();
  const { isAuthenticated, user } = useAuth();
  const toast = useToast();

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) return setNotifications([]);
    setLoading(true);
    try {
      const data = await notificationsService.getNotifications();
      setNotifications(Array.isArray(data) ? data : (data.notifications || []));
    } catch (e) {
      console.error('Failed to load notifications', e);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!on) return;
    // subscribe to incoming notifications via socket
    const unsub = on('notification', (note) => {
      try {
        setNotifications((prev) => [note, ...prev]);
        try { if (toast && typeof toast.showToast === 'function') toast.showToast(note.title || 'New notification', { type: 'default', duration: 3000 }); } catch(e){}

        // For rating-related notifications, also trigger a global modal open so
        // users receive an immediate in-app prompt (driver/vendor rating modals).
        try {
          const t = note && note.data && note.data.type;
          if (t === 'rate_driver' && note.data && note.data.driver) {
            window.dispatchEvent(new CustomEvent('openEntityModal', { detail: { entity: 'driver', id: note.data.driver, orderId: note.data.orderId } }));
          } else if (t === 'rate_vendor' && note.data && (note.data.vendor || note.data.vendorId)) {
            const vid = note.data.vendor || note.data.vendorId;
            window.dispatchEvent(new CustomEvent('openEntityModal', { detail: { entity: 'vendor', id: vid, orderId: note.data.orderId } }));
          } else if (t === 'vendor_rate_driver' && note.data && note.data.driver) {
            // vendor asked to rate driver
            window.dispatchEvent(new CustomEvent('openEntityModal', { detail: { entity: 'driver', id: note.data.driver, orderId: note.data.orderId } }));
          } else if (t === 'driver_rate_vendors' && note.data && Array.isArray(note.data.vendors) && note.data.vendors.length > 0) {
            // driver asked to rate vendors: open first vendor modal
            window.dispatchEvent(new CustomEvent('openEntityModal', { detail: { entity: 'vendor', id: note.data.vendors[0], orderId: note.data.orderId } }));
          }
        } catch (e) { /* ignore modal dispatch errors */ }
      } catch (e) { console.error('incoming notification handler', e); }
    });
    // subscribe to notificationRead events so server can mark notifications read via websocket
    const unsubRead = on('notificationRead', (payload) => {
      try {
        if (!payload) return;
        // payload: { notificationId, conversationId }
        setNotifications(prev => prev.map(n => {
          if (payload.notificationId && n._id === payload.notificationId) return { ...n, read: true };
          if (payload.conversationId && n.data && n.data.conversationId && n.data.conversationId.toString() === payload.conversationId.toString()) return { ...n, read: true };
          return n;
        }));
      } catch (e) { console.error('notificationRead handler', e); }
    });
    // when a newNeedSupport summary arrives, create a per-user notification (ensures in-app notifications appear)
    const unsubNewNeed = on('newNeedSupport', async (payload) => {
      try {
        if (!payload || !payload.conversationId) return;
        if (!user || !(user.role === 'support' || user.role === 'admin')) return;
        // create a notification for this support user via API; server will emit the created notification back via 'notification'
        await notificationsService.createNotification({ userId: user._id, title: 'New support request', body: payload.lastMessage ? payload.lastMessage.text : 'A conversation needs support', data: { conversationId: payload.conversationId, type: 'support_request' } });
      } catch (e) { console.error('failed to create per-user notification from newNeedSupport', e); }
    });
    return () => {
      try { unsub && unsub(); } catch (e) {}
      try { unsubRead && unsubRead(); } catch (e) {}
      try { unsubNewNeed && unsubNewNeed(); } catch (e) {}
    };
  }, [on, toast, user]);

  const markRead = async (id) => {
    try {
      const res = await notificationsService.markRead(id);
      setNotifications((prev) => prev.map(n => n._id === id ? res : n));
      return res;
    } catch (e) { console.error(e); throw e; }
  };

  const markAllRead = async () => {
    try {
      await notificationsService.markAllRead();
      setNotifications((prev) => prev.map(n => ({ ...n, read: true })));
    } catch (e) { console.error(e); }
  };

  const deleteNotification = async (id) => {
    try {
      await notificationsService.deleteNotification(id);
      setNotifications((prev) => prev.filter(n => n._id !== id));
      return true;
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <NotificationsContext.Provider value={{ notifications, loading, refresh, markRead, markAllRead, deleteNotification, unreadCount }}>
      {children}
    </NotificationsContext.Provider>
  );
};

export default NotificationsContext;

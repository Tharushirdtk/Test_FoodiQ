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
  const { isAuthenticated } = useAuth();
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
      } catch (e) { console.error('incoming notification handler', e); }
    });
    return () => {
      try { unsub && unsub(); } catch (e) {}
    };
  }, [on, toast]);

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

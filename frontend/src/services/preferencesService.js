import api from '../utils/apiClient';

const preferencesService = {
  getPreferences: async () => {
    const res = await api.get('/preferences');
    return res.data;
  },

  updatePreferences: async (prefs) => {
    const res = await api.put('/preferences', prefs);
    return res.data;
  },

  getNotifications: async () => {
    const res = await api.get('/preferences/notifications');
    return res.data;
  },

  markNotificationRead: async (id) => {
    const res = await api.put(`/preferences/notifications/${id}/read`);
    return res.data;
  },

  markAllNotificationsRead: async () => {
    const res = await api.put('/preferences/notifications/read-all');
    return res.data;
  },

  deleteNotification: async (id) => {
    const res = await api.delete(`/preferences/notifications/${id}`);
    return res.data;
  },

  clearAllNotifications: async () => {
    const res = await api.delete('/preferences/notifications');
    return res.data;
  }
};

export default preferencesService;

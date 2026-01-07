import api from '../utils/apiClient';

const notificationsService = {
  getNotifications: async () => {
    const res = await api.get('/notifications');
    return res.data;
  },
  createNotification: async (payload) => {
    const res = await api.post('/notifications', payload);
    return res.data;
  },
  markRead: async (id) => {
    const res = await api.put(`/notifications/${id}/read`);
    return res.data;
  },
  markAllRead: async () => {
    const res = await api.put('/notifications/readAll');
    return res.data;
  },
  deleteNotification: async (id) => {
    const res = await api.delete(`/notifications/${id}`);
    return res.data;
  }
};

export default notificationsService;

import api from '../utils/apiClient';

const adminService = {
  listUsers: async (params = {}) => {
    const res = await api.get('/admin/users', { params });
    return res.data;
  },
  createUser: async (payload) => {
    const res = await api.post('/admin/users', payload);
    return res.data;
  },
  updateUser: async (id, payload) => {
    const res = await api.put(`/admin/users/${id}`, payload);
    return res.data;
  },
  deleteUser: async (id) => {
    const res = await api.delete(`/admin/users/${id}`);
    return res.data;
  },
  getStats: async () => {
    const res = await api.get('/admin/stats');
    return res.data;
  },
  exportOrdersCsv: async (params = {}) => {
    const res = await api.get('/admin/orders/export', { params, responseType: 'blob' });
    return res.data;
  },
};

export default adminService;

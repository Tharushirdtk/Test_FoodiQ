import api from '../utils/apiClient';

const orderService = {
  createOrder: async (payload) => {
    const res = await api.post('/orders', payload);
    return res.data;
  },

  getOrders: async () => {
    const res = await api.get('/orders');
    return res.data;
  },

  getOrder: async (orderId) => {
    const res = await api.get(`/orders/${orderId}`);
    return res.data;
  }
};

export default orderService;

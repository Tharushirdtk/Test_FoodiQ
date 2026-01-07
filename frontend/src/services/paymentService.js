import api from '../utils/apiClient';

const paymentService = {
  createPaymentIntent: async ({ orderId, amount }) => {
    const res = await api.post('/payments/create-intent', { orderId, amount });
    return res.data;
  },

  // For mocked providers: confirm payment locally
  confirmPayment: async ({ paymentIntentId }) => {
    const res = await api.post('/payments/confirm', { paymentIntentId });
    return res.data;
  },

  // Payment methods management
  getPaymentMethods: async () => {
    const res = await api.get('/payments/methods');
    return res.data;
  },

  addPaymentMethod: async (data) => {
    const res = await api.post('/payments/methods', data);
    return res.data;
  },

  deletePaymentMethod: async (id) => {
    const res = await api.delete(`/payments/methods/${id}`);
    return res.data;
  },

  setDefaultPaymentMethod: async (id) => {
    const res = await api.put(`/payments/methods/${id}/default`);
    return res.data;
  }
};

export default paymentService;

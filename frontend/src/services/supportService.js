import api from '../utils/apiClient';

const supportService = {
  createTicket: async ({ subject, message, orderId }) => {
    const res = await api.post('/support', { subject, message, orderId });
    return res.data;
  },

  submitTicket: async ({ subject, message, email }) => {
    const res = await api.post('/support/ticket', { subject, message, email });
    return res.data;
  }
};

export default supportService;

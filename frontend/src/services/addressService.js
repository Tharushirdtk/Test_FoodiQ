import api from '../utils/apiClient';

const addressService = {
  getAddresses: async () => {
    const res = await api.get('/users/addresses');
    return res.data;
  },

  createAddress: async (payload) => {
    const res = await api.post('/users/addresses', payload);
    return res.data;
  },

  updateAddress: async (id, payload) => {
    const res = await api.put(`/users/addresses/${id}`, payload);
    return res.data;
  },

  deleteAddress: async (id) => {
    const res = await api.delete(`/users/addresses/${id}`);
    return res.data;
  },

  setPrimary: async (id) => {
    const res = await api.put(`/users/addresses/${id}/primary`);
    return res.data;
  }
};

export default addressService;

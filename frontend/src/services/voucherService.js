import api from '../utils/apiClient';

const voucherService = {
  validate: async (code) => {
    const res = await api.post('/vouchers/validate', { code });
    return res.data;
  }
};

export default voucherService;

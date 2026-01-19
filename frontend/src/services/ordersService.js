import api from '../utils/apiClient';

const exportOrdersCsv = async (params = {}) => {
  const res = await api.get('/orders/export', { params, responseType: 'blob' });
  return res.data;
};

const ordersService = { exportOrdersCsv };
export default ordersService;

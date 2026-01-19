import api from '../utils/apiClient';

const driverService = {
  getDriverForOrder: async (orderId) => {
    const res = await api.get(`/drivers/order/${orderId}`);
    return res.data;
  }
};

export default driverService;

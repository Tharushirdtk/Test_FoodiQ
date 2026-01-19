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

  getAssignedOrders: async ({ fallback = true } = {}) => {
    // request assigned-only orders for drivers
    const res = await api.get('/orders', { params: { assignedOnly: true } });
    let data = res.data;
    if ((!data || data.length === 0) && fallback) {
      // If no assigned orders, fallback to available orders for pickup
      try {
        const fb = await api.get('/orders/available');
        data = fb.data;
      } catch (e) {
        // fallback to generic orders list if available endpoint fails
        try { const alt = await api.get('/orders'); data = alt.data; } catch (err) { /* ignore */ }
      }
    }
    return data;
  },

  getAvailableOrders: async () => {
    const res = await api.get('/orders/available');
    return res.data;
  },

  getDriverHistory: async (opts = {}) => {
    // opts: { status }
    const params = {};
    if (opts.status) params.status = opts.status;
    const res = await api.get('/orders/driver/history', { params });
    return res.data;
  },

  getOrder: async (orderId) => {
    // Debug: log token sources before request
    try {
      // eslint-disable-next-line no-console
      console.debug('[orderService] getOrder', orderId, 'localToken=', localStorage.getItem('token'), 'sessionToken=', sessionStorage.getItem('token'));
    } catch (e) {}
    const res = await api.get(`/orders/${orderId}`);
    return res.data;
  }
  ,
  assignOrder: async (orderId, payload = {}) => {
    try {
      try { console.debug('[orderService] assignOrder', { orderId, payloadSample: Array.isArray(payload.vendorPickupOrder) ? payload.vendorPickupOrder.slice(0,3) : payload.vendorPickupOrder, localToken: localStorage.getItem('token'), sessionToken: sessionStorage.getItem('token') }); } catch (e) {}
      const res = await api.post(`/orders/${orderId}/assign`, payload);
      try { console.debug('[orderService] assignOrder response', { orderId, status: res && res.status, dataSample: res && res.data && (res.data.order ? { orderId: res.data.order._id } : null) }); } catch (e) {}
      return res.data;
    } catch (e) {
      try { console.error('[orderService] assignOrder error', e && (e.response && e.response.data ? e.response.data : e.message || e)); } catch (logErr) {}
      throw e;
    }
  }
  ,
  startDelivery: async (orderId) => {
    const res = await api.post(`/orders/${orderId}/start`);
    return res.data;
  },
  visitStop: async (orderId, index) => {
    const res = await api.post(`/orders/${orderId}/stop/${index}/visit`);
    return res.data;
  },
  deliverOrder: async (orderId) => {
    const res = await api.post(`/orders/${orderId}/deliver`);
    return res.data;
  },
  vendorPrepare: async (orderId, vendorId) => {
    const res = await api.post(`/orders/${orderId}/vendor/${vendorId}/prepare`);
    return res.data;
  },
  vendorReady: async (orderId, vendorId) => {
    const res = await api.post(`/orders/${orderId}/vendor/${vendorId}/ready`);
    return res.data;
  },
  cancelOrder: async (orderId) => {
    const res = await api.put(`/orders/${orderId}/cancel`);
    return res.data;
  }
  ,
  updateOrderStatus: async (orderId, status) => {
    const res = await api.put(`/orders/${orderId}/status`, { status });
    return res.data;
  }
  ,
  confirmPickup: async (orderId) => {
    const res = await api.post(`/orders/${orderId}/confirm-pickup`);
    return res.data;
  },
  completeOrder: async (orderId) => {
    const res = await api.post(`/orders/${orderId}/complete`);
    return res.data;
  }
  ,
  vendorPicked: async (orderId, vendorId) => {
    const res = await api.post(`/orders/${orderId}/vendor/${vendorId}/picked`);
    return res.data;
  }
  ,
  unassignOrder: async (orderId) => {
    const res = await api.post(`/orders/${orderId}/unassign`);
    return res.data;
  }
};

export default orderService;

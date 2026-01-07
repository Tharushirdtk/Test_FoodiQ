import api from '../utils/apiClient';

const cartService = {
  getCart: async () => {
    const res = await api.get('/cart');
    return res.data;
  },

  addToCart: async (productId, quantity = 1, options = {}) => {
    // options can include: extras, size, spiceLevel, instructions
    const res = await api.post('/cart', { productId, quantity, options });
    return res.data;
  },

  updateCartItem: async (itemId, quantity, options = null) => {
    const payload = { quantity };
    if (options) payload.options = options;
    const res = await api.put(`/cart/${itemId}`, payload);
    return res.data;
  },

  removeFromCart: async (itemId) => {
    const res = await api.delete(`/cart/${itemId}`);
    return res.data;
  },

  clearCart: async () => {
    // Some backends implement DELETE /cart to clear; fall back if needed
    try {
      const res = await api.delete('/cart');
      return res.data;
    } catch (err) {
      // ignore
      return null;
    }
  }
};

export default cartService;

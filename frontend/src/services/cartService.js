import api from '../utils/apiClient';

const cartService = {
  getCart: async () => {
    // Debug: log token sources before request
    try {
      // eslint-disable-next-line no-console
      console.debug('[cartService] getCart', 'localToken=', localStorage.getItem('token'), 'sessionToken=', sessionStorage.getItem('token'));
    } catch (e) {}
    const res = await api.get('/cart');
    return res.data;
  },

  addToCart: async (productId, quantity = 1, options = {}, selectedAttributes = []) => {
    // options can include: extras, size, spiceLevel, instructions
    // selectedAttributes may be passed at root for compatibility with socket payloads
    const payload = { productId, quantity, options };
    if (Array.isArray(selectedAttributes) && selectedAttributes.length > 0) payload.selectedAttributes = selectedAttributes;
    const res = await api.post('/cart', payload);
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

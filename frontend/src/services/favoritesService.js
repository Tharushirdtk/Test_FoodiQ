import api from '../utils/apiClient';

const listeners = new Set();

const favoritesService = {
  getFavorites: async () => {
    const res = await api.get('/users/favorites');
    return res.data;
  },
  addFavorite: async (productId) => {
    const res = await api.post('/users/favorites', { productId });
    // notify subscribers that favorites changed
    favoritesService.notifyFavoritesChange();
    return res.data;
  },
  removeFavorite: async (id) => {
    const res = await api.delete(`/users/favorites/${id}`);
    // notify subscribers that favorites changed
    favoritesService.notifyFavoritesChange();
    return res.data;
  },
  onChange: (cb) => {
    if (typeof cb === 'function') listeners.add(cb);
  },
  offChange: (cb) => {
    listeners.delete(cb);
  },
  notifyFavoritesChange: () => {
    listeners.forEach((cb) => {
      try { cb(); } catch (e) { /* ignore listener errors */ }
    });
  }
};

export default favoritesService;

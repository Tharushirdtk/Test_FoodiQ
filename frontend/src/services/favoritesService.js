import api from '../utils/apiClient';

const listeners = new Set();

const favoritesService = {
  getFavorites: async () => {
    console.log('[favoritesService] GET /users/favorites - requesting');
    const res = await api.get('/users/favorites');
    console.log('[favoritesService] GET /users/favorites - response', res && res.data);
    // backend returns { favorites: [...] }
    return (res.data && res.data.favorites) ? res.data.favorites : [];
  },
  addFavorite: async (productId) => {
    console.log('[favoritesService] POST /users/favorites - payload', { productId });
    const res = await api.post('/users/favorites', { productId });
    console.log('[favoritesService] POST /users/favorites - response', res && res.data);
    // notify subscribers that favorites changed
    favoritesService.notifyFavoritesChange();
    return res.data;
  },
  removeFavorite: async (id) => {
    console.log('[favoritesService] DELETE /users/favorites/%s - requesting', id);
    const res = await api.delete(`/users/favorites/${id}`);
    console.log('[favoritesService] DELETE /users/favorites/%s - response', id, res && res.data);
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

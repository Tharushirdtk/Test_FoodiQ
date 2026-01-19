import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach token from localStorage if present
api.interceptors.request.use(
  (config) => {
    // support token stored in localStorage or sessionStorage
    let token = null;
    try {
      token = localStorage.getItem('token') || sessionStorage.getItem('token');
    } catch (e) {
      token = null;
    }
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      config.headers['x-access-token'] = token;
    }

    // Excessive debug: log request method, url and whether auth headers are present
    try {
      const masked = (h) => {
        if (!h) return null;
        try { return `${h.slice(0,6)}...${h.slice(-4)}`; } catch (e) { return '***'; }
      };
      // eslint-disable-next-line no-console
      console.debug('[apiClient] Request', config.method?.toUpperCase(), config.url, 'Auth:', masked(config.headers.Authorization), 'x-token:', Boolean(config.headers['x-access-token']));
    } catch (e) { /* ignore logging errors */ }
    return config;
  },
  (error) => Promise.reject(error)
);

// Helper to set / clear token programmatically
api.setToken = (token) => {
  if (token) {
    try { localStorage.setItem('token', token); } catch (e) {}
    try { sessionStorage.setItem('token', token); } catch (e) {}
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    api.defaults.headers.common['x-access-token'] = token;
  } else {
    try { localStorage.removeItem('token'); } catch (e) {}
    try { sessionStorage.removeItem('token'); } catch (e) {}
    delete api.defaults.headers.common['Authorization'];
    delete api.defaults.headers.common['x-access-token'];
  }
};

// Global response handler: if any request returns 401, force logout and redirect to login.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    try {
      const status = error?.response?.status;
      // Only handle auth errors (401). Ignore other errors here.
      if (status === 401) {
        // eslint-disable-next-line no-console
        console.warn('[apiClient] Received 401 — clearing token and redirecting to /login');
        try { api.setToken(null); } catch (e) {}
        // Avoid interfering with API calls from non-browser contexts
        if (typeof window !== 'undefined' && window.location) {
          // If we're already on the login or register pages, don't redirect again (prevents refresh loop)
          const pathname = window.location.pathname || '';
          const skipPaths = ['/login', '/register', '/signup', '/auth', '/forgot-password', '/reset-password', '/reset'];
          const isSkip = skipPaths.some(p => pathname.startsWith(p));
          if (!isSkip) {
            // preserve current page so user can come back after login if desired
            const next = window.location.pathname + window.location.search;
            window.location.href = `/login?next=${encodeURIComponent(next)}`;
          } else {
            // already on login - do nothing further
            // eslint-disable-next-line no-console
            console.debug('[apiClient] 401 received on /login — not redirecting to avoid loop');
          }
        }
      }
    } catch (e) { /* swallow */ }
    return Promise.reject(error);
  }
);

export default api;

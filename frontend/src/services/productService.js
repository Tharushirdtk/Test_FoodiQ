import api from '../utils/apiClient';

const productService = {
  // Get products with pagination, search, filters, sorting
  getProducts: async (params = {}) => {
    const res = await api.get('/products', { params });
    return res.data;
  },

  // Get single product by ID
  getProduct: async (id) => {
    const res = await api.get(`/products/${id}`);
    return res.data;
  },

  // Reviews
  getReviews: async (productId, options = {}) => {
    const res = await api.get(`/products/${productId}/reviews`, { params: options });
    return res.data;
  },

  addReview: async (productId, payload) => {
    const res = await api.post(`/products/${productId}/reviews`, payload);
    return res.data;
  },

  updateReview: async (productId, reviewId, payload) => {
    const res = await api.patch(`/products/${productId}/reviews/${reviewId}`, payload);
    return res.data;
  },

  deleteReview: async (productId, reviewId) => {
    const res = await api.delete(`/products/${productId}/reviews/${reviewId}`);
    return res.data;
  },

  // Helper to build query params
  buildQueryParams: ({ page, limit, search, category, minPrice, maxPrice, minRating, sort, updatedSince, vendor }) => {
    const params = {};
    if (page) params.page = page;
    if (limit) params.limit = limit;
    if (search) params.search = search;
    if (category && category !== 'All') params.category = category;
    if (minPrice !== undefined) params.minPrice = minPrice;
    if (maxPrice !== undefined) params.maxPrice = maxPrice;
    if (minRating !== undefined) params.minRating = minRating;
    if (sort) params.sort = sort;
    if (vendor) params.vendor = vendor;
    if (updatedSince) params.updatedSince = updatedSince;
    return params;
  }
  ,

  // Vendor/product CRUD with image upload
  createProduct: async (formData) => {
    // formData is a FormData instance with fields and optional 'image' file
    const res = await api.post('/products', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return res.data;
  },

  updateProduct: async (id, formData) => {
    const res = await api.put(`/products/${id}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return res.data;
  },

  deleteProduct: async (id) => {
    const res = await api.delete(`/products/${id}`);
    return res.data;
  }
};

export default productService;

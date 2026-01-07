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

  // Helper to build query params
  buildQueryParams: ({ page, limit, search, category, minPrice, maxPrice, sort }) => {
    const params = {};
    if (page) params.page = page;
    if (limit) params.limit = limit;
    if (search) params.search = search;
    if (category && category !== 'All') params.category = category;
    if (minPrice !== undefined) params.minPrice = minPrice;
    if (maxPrice !== undefined) params.maxPrice = maxPrice;
    if (sort) params.sort = sort;
    return params;
  }
};

export default productService;

import { useEffect, useState, useCallback } from 'react';
import productService from '../services/productService';

export default function useProducts(initialParams = {}) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 12,
    total: 0,
    pages: 0,
    hasMore: false,
  });
  const [filterOptions, setFilterOptions] = useState({
    categories: ['All'],
    priceRange: { min: 0, max: 10000 },
  });

  // Current query params
  const [params, setParams] = useState({
    page: 1,
    limit: 12,
    search: '',
    category: 'All',
    minPrice: undefined,
    maxPrice: undefined,
    sort: '',
    ...initialParams,
  });

  const fetchProducts = useCallback(async (queryParams = params, append = false) => {
    setLoading(true);
    setError(null);
    try {
      const data = await productService.getProducts(queryParams);
      
      // Handle both old (array) and new (object with pagination) response formats
      if (Array.isArray(data)) {
        // Old format - backwards compatibility
        setProducts(data);
        setPagination({
          page: 1,
          limit: data.length,
          total: data.length,
          pages: 1,
          hasMore: false,
        });
      } else {
        // New format with pagination
        if (append) {
          setProducts(prev => [...prev, ...data.products]);
        } else {
          setProducts(data.products || []);
        }
        setPagination(data.pagination || {
          page: 1,
          limit: 12,
          total: 0,
          pages: 0,
          hasMore: false,
        });
        if (data.filters) {
          setFilterOptions(data.filters);
        }
      }
    } catch (err) {
      setError(err);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    fetchProducts(params);
  }, [params, fetchProducts]);

  // Load more products (for infinite scroll)
  const loadMore = useCallback(() => {
    if (pagination.hasMore && !loading) {
      const nextParams = { ...params, page: pagination.page + 1 };
      setParams(nextParams);
      fetchProducts(nextParams, true);
    }
  }, [pagination, params, loading, fetchProducts]);

  // Update search
  const setSearch = useCallback((search) => {
    setParams(prev => ({ ...prev, search, page: 1 }));
  }, []);

  // Update category filter
  const setCategory = useCallback((category) => {
    setParams(prev => ({ ...prev, category, page: 1 }));
  }, []);

  // Update price range filter
  const setPriceRange = useCallback((minPrice, maxPrice) => {
    setParams(prev => ({ ...prev, minPrice, maxPrice, page: 1 }));
  }, []);

  // Update sort
  const setSort = useCallback((sort) => {
    setParams(prev => ({ ...prev, sort, page: 1 }));
  }, []);

  // Update page
  const setPage = useCallback((page) => {
    setParams(prev => ({ ...prev, page }));
  }, []);

  // Reset all filters
  const resetFilters = useCallback(() => {
    setParams({
      page: 1,
      limit: 12,
      search: '',
      category: 'All',
      minPrice: undefined,
      maxPrice: undefined,
      sort: '',
    });
  }, []);

  // Manual refresh
  const refresh = useCallback(() => {
    fetchProducts(params);
  }, [params, fetchProducts]);

  return {
    products,
    loading,
    error,
    pagination,
    filterOptions,
    params,
    setSearch,
    setCategory,
    setPriceRange,
    setSort,
    setPage,
    loadMore,
    resetFilters,
    refresh,
  };
}

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { 
  FiSearch, FiStar, FiHeart, FiChevronUp, FiChevronDown, 
  FiX, FiLoader, FiGrid, FiList, FiSliders, FiClock
} from 'react-icons/fi';
import '../styles/StorePage.css';
import useProducts from '../hooks/useProducts';
import productService from '../services/productService';
import { useLocation } from 'react-router-dom';
import MultiSelectDropdown from '../components/MultiSelectDropdown';
import Dropdown from '../components/Dropdown';
import NotificationsButton from '../components/NotificationsButton';

const StorePage = () => {
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const { isGuest } = useAuth();
  const toast = useToast();
  
  const location = useLocation();

  // Parse URL search params early so UI state initializes from them
  const parseInitialParams = () => {
    const sp = new URLSearchParams(location.search);
    const p = {};
    if (sp.get('page')) p.page = Number(sp.get('page'));
    if (sp.get('limit')) p.limit = Number(sp.get('limit'));
    if (sp.get('search')) p.search = sp.get('search');
    if (sp.get('category')) p.category = sp.get('category');
    if (sp.get('minPrice')) p.minPrice = Number(sp.get('minPrice'));
    if (sp.get('maxPrice')) p.maxPrice = Number(sp.get('maxPrice'));
    if (sp.get('minRating')) p.minRating = Number(sp.get('minRating'));
    if (sp.get('sort')) p.sort = sp.get('sort');
    if (sp.get('vendor')) p.vendor = sp.get('vendor');
    return p;
  };

  const initialQuery = parseInitialParams();

  // Derived initial selected categories array for initialization comparisons
  const initialSelectedCategories = (() => {
    const cat = initialQuery.category;
    if (!cat || cat === 'All') return [];
    return cat.split(',').map(c => c.trim());
  })();

  // View mode: 'grid' | 'list'
  const [viewMode, setViewMode] = useState('grid');

  // Local search input state (debounced)
  const [searchInput, setSearchInput] = useState(() => initialQuery.search || '');

  // Selected categories (multi-select)
  const [selectedCategories, setSelectedCategories] = useState(() => initialSelectedCategories);
  // Selected vendor filter
  const [selectedVendor, setSelectedVendor] = useState(() => initialQuery.vendor || '');
  
  // Price sort state: null | 'asc' | 'desc'
  const [priceSort, setPriceSort] = useState(() => {
    const s = initialQuery.sort;
    if (s === 'price_asc') return 'asc';
    if (s === 'price_desc') return 'desc';
    return null;
  });
  
  // Price range modal state
  const [priceRangeModalOpen, setPriceRangeModalOpen] = useState(false);
  const [localMinPrice, setLocalMinPrice] = useState(() => initialQuery.minPrice !== undefined ? String(initialQuery.minPrice) : '');
  const [localMaxPrice, setLocalMaxPrice] = useState(() => initialQuery.maxPrice !== undefined ? String(initialQuery.maxPrice) : '');
  
  // Rating filter
  const [minRating, setMinRating] = useState(() => initialQuery.minRating !== undefined ? initialQuery.minRating : null);
  
  // Sort by options
  const [sortBy, setSortBy] = useState(() => initialQuery.sort || '');

  const initialParams = { limit: 12, ...initialQuery };

  const {
    products,
    loading,
    pagination,
    filterOptions,
    params,
    setSearch,
    setCategory,
    setPriceRange,
    setSort,
    setPage,
    setMinRating: setMinRatingParam,
    setVendor,
  } = useProducts(initialParams);

  // Keep URL in sync with current params so browser back/forward restores state
  useEffect(() => {
    const qObj = productService.buildQueryParams(params);
    const sp = new URLSearchParams();
    Object.keys(qObj).forEach(k => {
      if (qObj[k] !== undefined && qObj[k] !== null && qObj[k] !== '') {
        sp.set(k, String(qObj[k]));
      }
    });
    const search = sp.toString();
    navigate({ pathname: location.pathname, search: search ? `?${search}` : '' }, { replace: true });
  }, [params, navigate, location.pathname]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      const initialSearch = initialQuery.search || '';
      if (searchInput !== initialSearch) {
        setSearch(searchInput);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput, setSearch, initialQuery.search]);

  // Handle category change from multi-select
  useEffect(() => {
    // Skip updating on mount if selectedCategories matches initial URL value
    const same = initialSelectedCategories.length === selectedCategories.length && initialSelectedCategories.every((v, i) => v === selectedCategories[i]);
    if (same) return;

    if (selectedCategories.length === 0) {
      setCategory('All');
    } else if (selectedCategories.length === 1) {
      setCategory(selectedCategories[0]);
    } else {
      // For multiple categories, we'll pass them as comma-separated
      setCategory(selectedCategories.join(','));
    }
  }, [selectedCategories, setCategory, initialSelectedCategories]);

  // Handle price sort toggle: null → asc → desc → null
  const handlePriceSortToggle = useCallback(() => {
    if (priceSort === null) {
      setPriceSort('asc');
      setSort('price_asc');
      setSortBy('price_asc');
    } else if (priceSort === 'asc') {
      setPriceSort('desc');
      setSort('price_desc');
      setSortBy('price_desc');
    } else {
      setPriceSort(null);
      setSort('');
      setSortBy('');
    }
  }, [priceSort, setSort]);

  // Apply price range filter
  const applyPriceRange = () => {
    const min = localMinPrice ? Number(localMinPrice) : undefined;
    const max = localMaxPrice ? Number(localMaxPrice) : undefined;
    setPriceRange(min, max);
    setPriceRangeModalOpen(false);
  };

  // Clear price range filter
  const clearPriceRange = () => {
    setLocalMinPrice('');
    setLocalMaxPrice('');
    setPriceRange(undefined, undefined);
    setPriceRangeModalOpen(false);
  };

  // Handle sort change
  const handleSortChange = (newSort) => {
    setSortBy(newSort);
    setSort(newSort);
    if (newSort === 'price_asc') {
      setPriceSort('asc');
    } else if (newSort === 'price_desc') {
      setPriceSort('desc');
    } else {
      setPriceSort(null);
    }
  };

  // Clear all filters
  const clearAllFilters = () => {
    setSearchInput('');
    setSearch('');
    setSelectedCategories([]);
    setCategory('All');
    setPriceRange(undefined, undefined);
    setLocalMinPrice('');
    setLocalMaxPrice('');
    setPriceSort(null);
    setSort('');
    setSortBy('');
    setMinRating(null);
  };

  const mapProduct = (p) => ({
    id: p._id || p.id,
    name: p.name,
    description: p.description || '',
    price: Number(p.price) || 0,
    rating: (p.rating !== undefined && p.rating !== null) ? Number(p.rating) : 0,
    time: p.time || '15-20 min',
    image: p.image || 'https://via.placeholder.com/400x300',
    category: p.category || 'Other',
    badge: p.badge || '',
  });

  // Map products to menu items (server-side filtering applied)
  const menuItems = products && products.length > 0 ? products.map(mapProduct) : [];

  // Get price sort button icon & state
  const getPriceSortIcon = () => {
    if (priceSort === 'asc') return <FiChevronDown size={14} />;
    if (priceSort === 'desc') return <FiChevronUp size={14} />;
    return null;
  };

  // Check if any filters are active
  const hasActiveFilters = searchInput || selectedCategories.length > 0 || 
    params.minPrice || params.maxPrice || priceSort || params.minRating || minRating;

  return (
    <div className="store-page">
      {/* Header */}
      <header className="store-header">
        <div className="header-bar">
          <button className="btn btn-icon logo-btn" onClick={() => navigate('/')}>
            <img src="/images/logo.png" alt="FoodIQ" className="header-logo-small" />
          </button>
          <h1>Menu</h1>
          <div className="header-actions">
            {!isGuest && (
              <>
                <button className="btn btn-icon" onClick={() => navigate('/account/favorites')}>
                  <FiHeart size={20} />
                </button>
                <div style={{ display: 'inline-block' }}>
                  <NotificationsButton />
                </div>
              </>
            )}
          </div>
        </div>

        <div className="search-bar">
          <FiSearch size={20} color="#ADADAD" />
          <input 
            type="text" 
            placeholder="Search in menu..." 
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          {searchInput && (
            <button className="search-clear" onClick={() => setSearchInput('')}>
              <FiX size={16} />
            </button>
          )}
        </div>

        {/* Filter Bar */}
        <div className="filter-bar">
          <div className="filter-row">
            {/* Category Multi-Select */}
            <MultiSelectDropdown
              options={filterOptions.categories}
              selected={selectedCategories}
              onChange={setSelectedCategories}
              placeholder="Category"
              allOptionLabel="All Categories"
            />

            {/* Vendor Filter - render immediately, disable until vendors are loaded */}
            {
              (() => {
                const hasVendors = Array.isArray(filterOptions.vendors) && filterOptions.vendors.length > 0;
                const vendorOptions = hasVendors
                  ? [ { value: '', label: 'All Vendors' }, ...filterOptions.vendors.map((v) => ({ value: v._id || v.id || v.value, label: v.storeName || v.vendorProfile?.storeName || v.displayName || v.name || 'Vendor' })) ]
                  : [ { value: '', label: 'All Vendors' } ];

                return (
                  <Dropdown
                    options={vendorOptions}
                    value={selectedVendor}
                    onChange={(val) => {
                      setSelectedVendor(val || '');
                      setVendor(val || undefined);
                    }}
                    placeholder="Vendor"
                    disabled={!hasVendors}
                  />
                );
              })()
            }

            {/* Price Sort Toggle */}
            <button
              className={`filter-chip ${priceSort ? 'active' : ''}`}
              onClick={handlePriceSortToggle}
            >
              Price {getPriceSortIcon()}
            </button>

            {/* Price Range Button */}
            <button
              className={`filter-chip ${params.minPrice || params.maxPrice ? 'active' : ''}`}
              onClick={() => setPriceRangeModalOpen(true)}
            >
              <FiSliders size={14} />
              Price Range
              {(params.minPrice || params.maxPrice) && (
                <span className="filter-indicator" />
              )}
            </button>

            {/* Rating Filter */}
            <Dropdown
              options={[
                { value: '', label: 'Any Rating' },
                { value: '4.5', label: '4.5+ ⭐' },
                { value: '4', label: '4+ ⭐' },
                { value: '3.5', label: '3.5+ ⭐' },
                { value: '3', label: '3+ ⭐' },
              ]}
              value={minRating ? String(minRating) : ''}
              onChange={(val) => {
                const r = val ? Number(val) : null;
                setMinRating(r);
                setMinRatingParam(r);
              }}
              placeholder="Any Rating"
              size="sm"
            />

            {/* Sort By */}
            <Dropdown
              options={[
                { value: '', label: 'Sort By' },
                { value: 'newest', label: 'Newest' },
                { value: 'price_asc', label: 'Price: Low to High' },
                { value: 'price_desc', label: 'Price: High to Low' },
                { value: 'rating', label: 'Top Rated' },
              ]}
              value={sortBy}
              onChange={handleSortChange}
              placeholder="Sort By"
              size="sm"
            />
          </div>

          {/* View Toggle & Clear Filters */}
          <div className="filter-actions">
            {hasActiveFilters && (
              <button className="clear-filters-btn" onClick={clearAllFilters}>
                <FiX size={14} />
                Clear Filters
              </button>
            )}
            
            <div className="view-toggle">
              <button
                className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => setViewMode('grid')}
                title="Grid View"
              >
                <FiGrid size={18} />
              </button>
              <button
                className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => setViewMode('list')}
                title="List View"
              >
                <FiList size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Results count */}
        {!loading && (
          <div className="results-info">
            <span>{pagination.total || menuItems.length} items found</span>
          </div>
        )}
      </header>

      {/* Price Range Modal */}
      {priceRangeModalOpen && (
        <div className="modal-overlay">
          <div className="price-range-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Set Price Range</h3>
              <button className="modal-close" onClick={() => setPriceRangeModalOpen(false)}>
                <FiX size={20} />
              </button>
            </div>
            <div className="modal-content">
              <div className="price-inputs">
                <div className="price-input-group">
                  <label>Minimum Price</label>
                  <div className="price-input-wrapper">
                    <span className="currency">Rs</span>
                    <input
                      type="number"
                      placeholder={filterOptions.priceRange?.min?.toString() || '0'}
                      value={localMinPrice}
                      onChange={(e) => setLocalMinPrice(e.target.value)}
                      min="0"
                    />
                  </div>
                </div>
                <div className="price-divider">to</div>
                <div className="price-input-group">
                  <label>Maximum Price</label>
                  <div className="price-input-wrapper">
                    <span className="currency">Rs</span>
                    <input
                      type="number"
                      placeholder={filterOptions.priceRange?.max?.toString() || '10000'}
                      value={localMaxPrice}
                      onChange={(e) => setLocalMaxPrice(e.target.value)}
                      min="0"
                    />
                  </div>
                </div>
              </div>
              {filterOptions.priceRange && (
                <p className="price-hint">
                  Available range: Rs {filterOptions.priceRange.min} - Rs {filterOptions.priceRange.max}
                </p>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={clearPriceRange}>
                Clear
              </button>
              <button className="btn btn-primary" onClick={applyPriceRange}>
                Apply Filter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="loading-container">
          <FiLoader className="loading-spinner" size={32} />
          <p>Loading menu...</p>
        </div>
      )}

      {/* Menu Content */}
      {!loading && (
        <>
          <div className={`menu-container ${viewMode}`}>
            {menuItems.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">🍽️</div>
                <h3>No items found</h3>
                <p>Try adjusting your filters or search terms</p>
                <button className="btn btn-primary" onClick={clearAllFilters}>
                  Clear All Filters
                </button>
              </div>
            ) : (
              <div className={`menu-${viewMode}`}>
                {menuItems.map((item) => (
                  <div 
                    key={item.id} 
                    className={`menu-item ${viewMode}`}
                    onClick={() => navigate(`/product/${item.id}`)}
                  >
                    <div className="menu-item-image">
                      {item.badge && (
                        <div className="item-badge">{item.badge}</div>
                      )}
                      <img src={item.image} alt={item.name} className="item-image" />
                    </div>

                    <div className="menu-item-info">
                      <div className="item-header">
                        <h3>{item.name}</h3>
                      </div>
                      
                      {(viewMode === 'list' || item.description) && (
                        <p className="item-description">
                          {item.description || 'Delicious food item'}
                        </p>
                      )}

                      <div className="item-meta">
                        <span className="rating">
                          <FiStar color="#FFA500" fill="#FFA500" size={14} />
                          {typeof item.rating === 'number' ? item.rating.toFixed(1) : item.rating}
                        </span>
                        {item.time && (
                          <>
                            <span className="separator">•</span>
                            <span className="time">
                              <FiClock size={12} />
                              {item.time}
                            </span>
                          </>
                        )}
                      </div>

                      <div className="item-footer">
                        <span className="price">Rs {item.price.toFixed(2)}</span>
                        <button 
                          className="btn btn-primary btn-sm add-btn"
                          onClick={async (e) => {
                              e.stopPropagation();
                              if (isGuest) {
                                navigate('/login');
                                return;
                              }
                              try {
                                const data = await productService.getProduct(item._id || item.id);
                                const full = data?.product || data || item;
                                const attrs = [];
                                const ags = Array.isArray(full.attributeGroups) ? full.attributeGroups : [];
                                for (const g of ags) {
                                  const groupKey = g.key || g.title || '';
                                  if (g.type === 'single-select') {
                                    const def = (g.attributes || []).find(a => a.defaultSelected);
                                    if (def) attrs.push({ groupKey, id: def._id || def.id, name: def.name, priceType: def.priceType || 'flat', amount: def.amount || 0, quantity: 1 });
                                  } else if (g.type === 'multi-select') {
                                    for (const a of (g.attributes || [])) {
                                      if (a && a.defaultSelected) attrs.push({ groupKey, id: a._id || a.id, name: a.name, priceType: a.priceType || 'flat', amount: a.amount || 0, quantity: a.quantityEnabled ? (a.defaultQuantity || 1) : 1 });
                                    }
                                  }
                                }
                                addToCart({ id: full._id || full.id || item.id, name: full.name || item.name, price: Number(full.price || item.price) || 0, image: full.image || item.image, quantity: 1, selectedAttributes: attrs });
                                if (toast && typeof toast.showToast === 'function') {
                                  toast.showToast(`${item.name} added to cart`, { type: 'success', duration: 2000 });
                                }
                              } catch (err) {
                                addToCart(item);
                                if (toast && typeof toast.showToast === 'function') {
                                  toast.showToast(`${item.name} added to cart`, { type: 'success', duration: 2000 });
                                }
                              }
                            }}
                        >
                          Add +
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pagination */}
          {pagination.pages > 1 && (
            <div className="pagination">
              <button
                className="btn btn-secondary btn-sm"
                disabled={pagination.page <= 1}
                onClick={() => setPage(pagination.page - 1)}
              >
                Previous
              </button>
              <div className="page-numbers">
                {Array.from({ length: Math.min(pagination.pages, 5) }, (_, i) => {
                  const pageNum = i + 1;
                  return (
                    <button
                      key={pageNum}
                      className={`page-btn ${pagination.page === pageNum ? 'active' : ''}`}
                      onClick={() => setPage(pageNum)}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                {pagination.pages > 5 && (
                  <>
                    <span className="page-dots">...</span>
                    <button
                      className={`page-btn ${pagination.page === pagination.pages ? 'active' : ''}`}
                      onClick={() => setPage(pagination.pages)}
                    >
                      {pagination.pages}
                    </button>
                  </>
                )}
              </div>
              <button
                className="btn btn-secondary btn-sm"
                disabled={!pagination.hasMore}
                onClick={() => setPage(pagination.page + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default StorePage;

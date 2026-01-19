import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import useProducts from '../hooks/useProducts';
import productService from '../services/productService';
import { FiMenu, FiShoppingBag, FiSearch, FiStar, FiClock, FiX, FiLoader } from 'react-icons/fi';
import NotificationsButton from '../components/NotificationsButton';
import Pagination from '../components/Pagination';
import '../styles/HomePage.css';
import { useAuth } from '../context/AuthContext';
import orderService from '../services/orderService';
import profileService from '../services/profileService';

const HomePage = () => {
  const navigate = useNavigate();
  const { getCartCount, addToCart } = useCart();
  const toast = useToast();
  const { role, isGuest } = useAuth();
  const [deliveryMethod, setDeliveryMethod] = useState('delivery');
  const [searchInput, setSearchInput] = useState('');

  const {
    products,
    loading,
    filterOptions,
    params,
    setSearch,
    setCategory,
  } = useProducts({ limit: 12 });

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput, setSearch]);

  // If driver and has an active assigned order, redirect to order tracking
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (role === 'driver') {
          // prefer checking driver profile assignedOrders first
          try {
            const prof = await profileService.getProfile();
            if (!mounted) return;
            const assignedArr = prof && (prof.driverProfile && Array.isArray(prof.driverProfile.assignedOrders)) ? prof.driverProfile.assignedOrders : (prof && Array.isArray(prof.assignedOrders) ? prof.assignedOrders : []);
            if (Array.isArray(assignedArr) && assignedArr.length > 0) {
              const id = assignedArr[0];
              if (id) { navigate(`/order/${id}`); return; }
            }
          } catch (e) {
            // fallback: check active assigned orders via API
            try {
              const assigned = await orderService.getAssignedOrders({ fallback: false });
              if (!mounted) return;
              if (Array.isArray(assigned) && assigned.length > 0) {
                const active = assigned.find(o => ['driver_assigned', 'out_for_delivery'].includes(o.status)) || assigned[0];
                if (active && active._id) { navigate(`/order/${active._id}`); return; }
              }
            } catch (e2) {}
          }

          // no assigned order found — send to driver orders
          navigate('/driver/orders');
        }
      } catch (e) { if (mounted) navigate('/driver/orders'); }
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  // Get active category from params
  const activeCategory = params.category || 'All';
  const hasFilters = (searchInput && searchInput.trim() !== '') || (activeCategory && activeCategory !== 'All');

  // Use filterOptions.categories or extract from products
  const categories = filterOptions.categories.length > 1 
    ? filterOptions.categories 
    : (products && products.length > 0)
      ? ['All', ...Array.from(new Set(products.map(p => p.category || 'Other')))]
      : ['All'];

  const mapProduct = (p) => ({
    id: p._id || p.id,
    name: p.name,
    description: p.description || '',
    price: Number(p.price) || 0,
    rating: (p.rating !== undefined && p.rating !== null) ? Number(p.rating) : 0,
    time: p.time || '15-20 min',
    image: p.image || p.imageUrl || 'https://via.placeholder.com/400x300',
    badge: p.badge || '',
    category: p.category || 'Other',
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    latestReviewAt: p.latestReviewAt,
    reviewCount: p.reviewCount || 0,
  });

  const allItems = products && products.length > 0 ? products.map(mapProduct) : [];

  // Popular Now should include high-rated products (rating > 4) that were reviewed/updated within last 30 days.
  // Fetch a broader candidate set from the API (minRating=4) so ratings updated elsewhere are included.
  const [popularCandidates, setPopularCandidates] = useState([]);
  const location = useLocation();

  // Initialize popular page from URL so back navigation restores it
  const initialPopularPage = (() => {
    try {
      const sp = new URLSearchParams(location.search);
      const p = Number(sp.get('popularPage')) || 1;
      return p > 0 ? p : 1;
    } catch (e) {
      return 1;
    }
  })();

  const [popularPage, setPopularPage] = useState(initialPopularPage);
  const popularPerPage = 12;
  const syncedFromUrlRef = React.useRef(false);

  useEffect(() => {
    let mounted = true;
    const fetchPopular = async () => {
      try {
        const oneMonthAgoLocal = new Date();
        oneMonthAgoLocal.setMonth(oneMonthAgoLocal.getMonth() - 1);
        const q = { minRating: 4, updatedSince: oneMonthAgoLocal.toISOString(), limit: 500, sort: 'rating' };
        if (activeCategory && activeCategory !== 'All') q.category = activeCategory;
        const data = await productService.getProducts(q);
        const list = Array.isArray(data) ? data : (data.products || []);
        if (!mounted) return;
        setPopularCandidates(list.map(mapProduct));
      } catch (err) {
        console.error('Failed to load popular candidates', err);
        if (mounted) setPopularCandidates([]);
      }
    };
    fetchPopular();

    return () => { mounted = false; };
  }, [location.key, activeCategory]);

  // Sync popularPage from URL when navigation changes so Back restores the same page
  useEffect(() => {
    try {
      const sp = new URLSearchParams(location.search);
      const p = Number(sp.get('popularPage')) || 1;
      if (p > 0 && p !== popularPage) {
        setPopularPage(p);
      }
      // mark that we've synced from URL at least once
      syncedFromUrlRef.current = true;
    } catch (e) {
      // ignore parse errors
    }
  }, [location.search, popularPage]);

  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

  const featuredItems = (popularCandidates || [])
    .filter(item => (item.rating >= 4) && item.latestReviewAt && (new Date(item.latestReviewAt) >= oneMonthAgo) && (activeCategory === 'All' || item.category === activeCategory))
    .sort((a, b) => new Date(b.latestReviewAt) - new Date(a.latestReviewAt));
  const signatures = allItems && allItems.length > 0 ? allItems.filter(i => activeCategory === 'All' || i.category === activeCategory).slice(0, 4) : [];
  const popularPages = featuredItems.length > 0 ? Math.ceil(featuredItems.length / popularPerPage) : 0;

  // Ensure current popular page is valid when candidate list changes
  useEffect(() => {
    // Only adjust when we know how many pages exist to avoid resetting during initial load
    if (popularPages > 0 && popularPage > popularPages) {
      setPopularPage(popularPages);
    }
  }, [popularPage, popularPages]);

  const visibleFeatured = featuredItems.slice((popularPage - 1) * popularPerPage, popularPage * popularPerPage);

  // Keep popularPage in URL so back navigation preserves it
  useEffect(() => {
    try {
      // Do not push until we've synced the page from URL at least once
      if (!syncedFromUrlRef.current) return;
      const sp = new URLSearchParams(location.search);
      if (popularPage && Number(sp.get('popularPage')) !== popularPage) {
        sp.set('popularPage', String(popularPage));
        const search = sp.toString();
        const url = `${location.pathname}${search ? `?${search}` : ''}`;
        
        // push a new history entry so Back returns to the previous popular page
        navigate(url);
      }
    } catch (e) {
      // ignore
    }
  }, [popularPage, navigate, location.pathname, location.search]);

  // Handle search submit (navigate to store page with search)
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchInput.trim()) {
      navigate(`/store?search=${encodeURIComponent(searchInput.trim())}`);
    }
  };

  return (
    <div className="homepage">
      <div className="homepage-content">
      {/* Header */}
      <header className="header">
        <div className="header-top">
          {/* <button className="btn btn-icon" style={{ cursor: 'default' }}>
            <FiMenu size={24} />
          </button> */}
          <div className="header-logo">
            <button className="btn btn-icon logo-btn" onClick={() => navigate('/')}>
              <img src="/images/logo.png" alt="FoodIQ Logo" className="header-logo-small" />
            </button>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, visibility: isGuest ? 'hidden' : 'visible' }}>
            <button className="btn btn-icon cart-btn" onClick={() => navigate('/cart')}>
              <FiShoppingBag size={24} />
              {getCartCount() > 0 && <span className="cart-badge">{getCartCount()}</span>}
            </button>
            <div style={{ display: 'inline-block' }}>
              <NotificationsButton />
            </div>
          </div>
        </div>

        <form className="search-bar-home" onSubmit={handleSearchSubmit}>
          <FiSearch size={20} color="#ADADAD" />
          <input 
            type="text" 
            placeholder="Search for food..." 
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          {searchInput && (
            <button type="button" className="search-clear" onClick={() => setSearchInput('')}>
              <FiX size={16} />
            </button>
          )}
        </form>
      </header>

      {/* Hero Banner (uses top product if available) */}
      {!loading && products && products.length > 0 && (() => {
        // Choose top hero product by review count using decreasing rating thresholds (step 0.5)
        const thresholds = [];
        for (let r = 4.5; r >= 0.0; r = Math.round((r - 0.5) * 10) / 10) thresholds.push(r);
        const mapped = products.map(mapProduct);
        let topProduct = null;
        for (const t of thresholds) {
          const candidates = mapped.filter(p => (typeof p.rating === 'number' ? p.rating : 0) >= t);
          if (candidates.length > 0) {
            // choose the most reviewed among candidates (highest reviewCount first)
            candidates.sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0));
            topProduct = candidates[0];
            break;
          }
        }

        // If no topProduct found across thresholds, do not render the hero section
        if (!topProduct) return null;

        const top = topProduct;
        return (
          <div className="hero-banner">
            <div className="hero-content">
              <div className="hero-image">
                <img src={top.image} alt={top.name} />
              </div>
              <div className="hero-text">
                <h1>{top.name}</h1>
                <p>{top.description}</p>
              </div>
            </div>
            <div className="hero-stats">
              <div className="stat">
                <span className="stat-value">{top.rating}</span>
                <span className="stat-label">Rating</span>
              </div>
              <div className="stat">
                <span className="stat-value">{top.reviewCount || 0}</span>
                <span className="stat-label">Reviews</span>
              </div>
              <div className="stat">
                <span className="stat-value">Rs {top.price.toFixed(2)}</span>
                <span className="stat-label">Price</span>
              </div>
            </div>
            <div className="hero-actions">
              <button 
                className={`btn ${deliveryMethod === 'delivery' ? 'btn-primary' : 'btn-secondary'}`} 
                style={{ flex: 1 }}
                onClick={() => setDeliveryMethod('delivery')}
              >
                <FiShoppingBag size={18} /> Delivery
              </button>
              <button 
                className={`btn ${deliveryMethod === 'pickup' ? 'btn-primary' : 'btn-secondary'}`} 
                style={{ flex: 1 }}
                onClick={() => setDeliveryMethod('pickup')}
              >
                Pickup
              </button>
            </div>
          </div>
        );
      })()}

      {/* Categories */}
      <div className="categories">
        <span className="categories-icon">
          <FiMenu size={20} />
        </span>
        {categories.map((category) => (
          <button
            key={category}
            className={`category-btn ${activeCategory === category ? 'active' : ''}`}
            onClick={() => setCategory(category)}
          >
            {category}
          </button>
        ))}
      </div>

      {/* Featured Items */}
      {/* use compact section when there are no featured items so it doesn't take excessive vertical space */}
      <section className={featuredItems.length === 0 ? 'section compact-section' : 'section'}>
        <div className="section-header">
          <h2>Popular Now</h2>
          <button className="btn-text" onClick={() => navigate('/store')}>View All</button>
        </div>
        
        {/* Loading State - only for this section */}
        {loading ? (
          <div className="section-loading">
            <FiLoader className="loading-spinner" size={28} />
            <p>Loading items...</p>
          </div>
        ) : featuredItems.length === 0 ? (
          hasFilters ? (
            <div className="empty-state">
              <p>No items found</p>
              <button className="btn btn-secondary" onClick={() => {
                setSearchInput('');
                setSearch('');
                setCategory('All');
              }}>
                Clear Filters
              </button>
            </div>
          ) : (
            <div className="empty-state compact">
              <p>No items found</p>
            </div>
          )
        ) : (
          <>
            <div className="food-grid">
              {visibleFeatured.map((item) => (
                <div 
                  key={item.id} 
                  className="food-card"
                  onClick={() => navigate(`/product/${item.id}`)}
                >
                  {item.discount && <div className="discount-badge">{item.discount}</div>}
                  {item.badge && <div className="badge">{item.badge}</div>}
                  <div className="food-image">
                    <img src={item.image} alt={item.name} />
                  </div>
                  <div className="food-info">
                    <h3>{item.name}</h3>
                    <p>{item.description}</p>
                    <div className="food-meta">
                      <span className="rating">
                        <FiStar color="#FFA500" fill="#FFA500" size={14} />
                        {typeof item.rating === 'number' ? item.rating.toFixed(1) : item.rating}
                      </span>
                      <span className="time">
                        <FiClock size={14} />
                        {item.time}
                      </span>
                    </div>
                    <div className="food-footer">
                      <span className="price">Rs {item.price.toFixed(2)}</span>
                      <button 
                        className="btn btn-primary btn-icon"
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            const data = await productService.getProduct(item.id || item._id);
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
                        +
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination for Popular Now - compute pages from filtered featuredItems so counts match visible items */}
            {popularPages > 1 && (
              <Pagination page={popularPage} pages={popularPages} onChange={(p) => setPopularPage(p)} total={featuredItems.length} perPage={popularPerPage} />
            )}
          </>
        )}
      </section>

      {/* Signatures */}
      {!loading && signatures.length > 0 && (
        <section className="section">
          <h2>Newest</h2>
          <div className="signature-list">
            {signatures.map((item) => (
              <div 
                key={item.id} 
                className="signature-item"
                onClick={() => navigate(`/product/${item.id}`)}
              >
                <div className="signature-image">
                  <img src={item.image} alt={item.name} />
                </div>
                <div className="signature-info">
                  <h4>{item.name}</h4>
                  <span className="price">Rs {item.price.toFixed(2)}</span>
                </div>
                <button 
                  className="btn btn-primary btn-icon"
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      const data = await productService.getProduct(item.id || item._id);
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
                    } catch (err) {
                      addToCart(item);
                    }
                  }}
                >
                  +
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
      </div>

      {/* Bottom navigation is now rendered globally in App.js */}
    </div>
  );
};

export default HomePage;

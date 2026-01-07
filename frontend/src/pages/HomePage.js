import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import useProducts from '../hooks/useProducts';
import { FiMenu, FiShoppingBag, FiSearch, FiStar, FiClock, FiX, FiLoader } from 'react-icons/fi';
import NotificationsButton from '../components/NotificationsButton';
import '../styles/HomePage.css';

const HomePage = () => {
  const navigate = useNavigate();
  const { getCartCount, addToCart } = useCart();
  const toast = useToast();
  const [deliveryMethod, setDeliveryMethod] = useState('delivery');
  const [searchInput, setSearchInput] = useState('');

  const {
    products,
    loading,
    pagination,
    filterOptions,
    params,
    setSearch,
    setCategory,
    setPage,
  } = useProducts({ limit: 12 });

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput, setSearch]);

  // Get active category from params
  const activeCategory = params.category || 'All';

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
    rating: p.rating || 4.5,
    time: p.time || '15-20 min',
    image: p.image || p.imageUrl || 'https://via.placeholder.com/400x300',
    badge: p.badge || '',
    category: p.category || 'Other'
  });

  const featuredItems = products && products.length > 0 ? products.map(mapProduct) : [];
  const signatures = products && products.length > 0 ? products.slice(0, 4).map(mapProduct) : [];

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
          <button className="btn btn-icon cart-btn" onClick={() => navigate('/cart')}>
            <FiShoppingBag size={24} />
            {getCartCount() > 0 && <span className="cart-badge">{getCartCount()}</span>}
          </button>
          <div style={{ marginLeft: 10, display: 'inline-block' }}>
            <NotificationsButton />
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
        const top = mapProduct(products[0]);
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
                <span className="stat-value">{top.reviews || 0}</span>
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
      <section className="section">
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
          <>
            <div className="food-grid">
              {featuredItems.map((item) => (
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
                        {item.rating}
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
                        onClick={(e) => {
                          e.stopPropagation();
                          addToCart(item);
                          if (toast && typeof toast.showToast === 'function') {
                            toast.showToast(`${item.name} added to cart`, { type: 'success', duration: 2000 });
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

            {/* Pagination for Popular Now */}
            {pagination.pages > 1 && (
              <div className="pagination">
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={pagination.page <= 1}
                  onClick={() => setPage(pagination.page - 1)}
                >
                  Previous
                </button>
                <span className="page-info">
                  Page {pagination.page} of {pagination.pages}
                </span>
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
      </section>

      {/* Signatures */}
      {!loading && signatures.length > 0 && (
        <section className="section">
          <h2>Signature</h2>
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
                  onClick={(e) => {
                    e.stopPropagation();
                    addToCart(item);
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

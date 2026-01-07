import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiTrash2 } from 'react-icons/fi';
import favoritesService from '../services/favoritesService';
import { useCart } from '../context/CartContext';
import QuickNavSidebar from '../components/QuickNavSidebar';
import '../styles/SubPage.css';

const FavoritesPage = () => {
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadFavorites();
  }, []);

  const loadFavorites = async () => {
    try {
      setLoading(true);
      const data = await favoritesService.getFavorites();
      setFavorites(data || []);
    } catch (err) {
      setError('Failed to load favorites');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (id) => {
    try {
      await favoritesService.removeFavorite(id);
      setFavorites(favorites.filter(f => f._id !== id));
    } catch (err) {
      setError('Failed to remove from favorites');
    }
  };

  const handleAddToCart = (product) => {
    addToCart({
      id: product._id,
      name: product.name,
      price: product.price,
      image: product.image,
      quantity: 1
    });
  };

  return (
    <div className="sub-page">
      <header className="sub-header">
        <button className="back-btn" onClick={() => navigate('/account')}>
          <FiArrowLeft size={24} />
        </button>
        <h1>Favorites</h1>
      </header>

      <div className="sub-content">
        {error && <div className="error-message">{error}</div>}

        {loading ? (
          <div className="loading-spinner-container">
            <div className="loading-spinner"></div>
          </div>
        ) : favorites.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">❤️</div>
            <h3>No favorites yet</h3>
            <p>Save your favorite items for quick access</p>
            <button className="btn" onClick={() => navigate('/store')}>
              Browse Menu
            </button>
          </div>
        ) : (
          <div className="card-list">
            {favorites.map(item => {
              const product = item.product || item;
              return (
                <div key={item._id} className="card-item" style={{ cursor: 'default' }}>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <img 
                      src={product.image || '/images/placeholder-food.jpg'} 
                      alt={product.name}
                      style={{ 
                        width: 80, 
                        height: 80, 
                        borderRadius: 12, 
                        objectFit: 'cover',
                        backgroundColor: 'var(--bg-light)'
                      }}
                      onClick={() => navigate(`/product/${product._id}`)}
                    />
                    <div style={{ flex: 1 }}>
                      <h3 
                        className="card-title" 
                        style={{ cursor: 'pointer' }}
                        onClick={() => navigate(`/product/${product._id}`)}
                      >
                        {product.name}
                      </h3>
                      <p style={{ fontSize: 13, color: 'var(--text-gray)', margin: '4px 0' }}>
                        {product.description?.slice(0, 60)}...
                      </p>
                      <span className="card-price">Rs. {product.price?.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="card-actions" style={{ marginTop: 12 }}>
                    <button 
                      className="card-action-btn primary"
                      onClick={() => handleAddToCart(product)}
                    >
                      Add to Cart
                    </button>
                    <button 
                      className="card-action-btn danger"
                      onClick={() => handleRemove(item._id)}
                    >
                      <FiTrash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom navigation is now rendered globally in App.js */}
      
      {/* Quick Navigation Sidebar */}
      <QuickNavSidebar />
    </div>
  );
};

export default FavoritesPage;

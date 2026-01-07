import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import productService from '../services/productService';
import favoritesService from '../services/favoritesService';
import { FiArrowLeft, FiHeart, FiStar, FiMinus, FiPlus, FiClock, FiCheck } from 'react-icons/fi';
import { AiFillHeart } from 'react-icons/ai';
import '../styles/ProductPage.css';

const ProductPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { addToCart } = useCart();
  const toast = useToast();
  const [quantity, setQuantity] = useState(1);
  const [selectedSize, setSelectedSize] = useState('Regular');
  const [spiceLevel, setSpiceLevel] = useState('Medium');
  const [extras, setExtras] = useState({
    extraCheese: false,
    grilledBacon: false,
    onionRings: false
  });
  const [selectedInstructions, setSelectedInstructions] = useState([]);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [skipNextRefresh, setSkipNextRefresh] = useState(false);

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Check if product is in favorites
  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      // Skip if this component just toggled favorite (avoid overwriting optimistic update)
      if (skipNextRefresh) {
        setSkipNextRefresh(false);
        return;
      }
      try {
        const favorites = await favoritesService.getFavorites();
        if (!mounted) return;
        const favList = favorites?.favorites || favorites || [];
        const isFav = favList.some(f => {
          const favProdId = f.product?._id || f.product?.id || f.productId || f._id;
          return favProdId === id;
        });
        setIsFavorite(isFav);
      } catch (err) {
        // Ignore - user might not be logged in
      }
    };

    refresh();
    favoritesService.onChange(refresh);
    return () => { mounted = false; favoritesService.offChange(refresh); };
  }, [id, skipNextRefresh]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await productService.getProduct(id);
        const p = data?.product || data || null;
        if (mounted) setProduct(p);
      } catch (err) {
        if (mounted) {
          setProduct(null);
          setError(err?.response?.data?.message || 'Failed to load product');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [id]);

  const sizes = [
    { name: 'Regular', price: 0 },
    { name: 'Large', price: 2 }
  ];

  const spiceLevels = ['Mild', 'Medium', 'Hot', 'Extra Hot'];

  const extrasOptions = [
    { id: 'extraCheese', name: 'Extra Cheese', price: 1.50 },
    { id: 'grilledBacon', name: 'Grilled Bacon', price: 2.00 },
    { id: 'onionRings', name: 'Onion Rings', price: 1.00 }
  ];

  const specialInstructions = [
    'Less Salt',
    'No Onions',
    'Extra Sauce',
    'Well Done'
  ];

  const handleExtrasToggle = (extraId) => {
    setExtras(prev => ({
      ...prev,
      [extraId]: !prev[extraId]
    }));
  };

  const handleInstructionToggle = (instruction) => {
    if (selectedInstructions.includes(instruction)) {
      setSelectedInstructions(selectedInstructions.filter(item => item !== instruction));
    } else {
      if (selectedInstructions.length < 2) {
        setSelectedInstructions([...selectedInstructions, instruction]);
      }
    }
  };

  const handleToggleFavorite = async () => {
    if (favoriteLoading) return;
    setFavoriteLoading(true);
    
    // Capture current state before toggling
    const wasAlreadyFavorite = isFavorite;
    
    // Optimistic UI update - immediately flip the heart
    setIsFavorite(!wasAlreadyFavorite);
    // Skip the next refresh triggered by notifyFavoritesChange to preserve optimistic state
    setSkipNextRefresh(true);
    
    try {
      if (wasAlreadyFavorite) {
        // Remove from favorites
        await favoritesService.removeFavorite(id);
      } else {
        // Add to favorites
        await favoritesService.addFavorite(id);
      }
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
      // Revert optimistic update on failure
      setIsFavorite(wasAlreadyFavorite);
      setSkipNextRefresh(false);
    } finally {
      setFavoriteLoading(false);
    }
  };

  const handleAddToCart = () => {
    if (!product) return;

    const selectedExtras = extrasOptions
      .filter(extra => extras[extra.id])
      .map(extra => ({ name: extra.name, price: extra.price }));

    const sizePrice = sizes.find(s => s.name === selectedSize)?.price || 0;

    const totalPrice = ((product?.price || 0) + sizePrice + selectedExtras.reduce((sum, extra) => sum + extra.price, 0)) * quantity;

    addToCart({
      id: product?._id || product?.id || product?.productId || id,
      name: product?.name || 'Product',
      price: totalPrice / quantity,
      image: product?.image || '',
      size: selectedSize,
      spiceLevel,
      extras: selectedExtras,
      instructions: selectedInstructions,
      quantity
    });

    // Show global toast and navigate shortly after
    if (toast && typeof toast.showToast === 'function') {
      toast.showToast('Added to cart', { type: 'success', duration: 2400 });
    }
    setAdding(true);
    setTimeout(() => {
      setAdding(false);
      navigate('/cart');
    }, 800);
  };

  const calculateTotal = () => {
    const sizePrice = sizes.find(s => s.name === selectedSize)?.price || 0;
    const extrasPrice = extrasOptions
      .filter(extra => extras[extra.id])
      .reduce((sum, extra) => sum + extra.price, 0);

    const base = (product && (product.price ?? product.price === 0)) ? product.price : 0;
    return ((base + sizePrice + extrasPrice) * quantity).toFixed(2);
  };

  const getCategoryLabel = (category) => {
    const labels = {
      'appetizer': 'Appetizer',
      'main': 'Main Course',
      'dessert': 'Dessert',
      'beverage': 'Beverage'
    };
    return labels[category] || category;
  };

  // Loading State
  if (loading) {
    return (
      <div className="product-page">
        <header className="product-header">
          <button className="btn btn-icon" onClick={() => navigate(-1)}>
            <FiArrowLeft size={24} />
          </button>
        </header>
        <div className="product-loading">
          <div className="loading-spinner"></div>
          <p>Loading product...</p>
        </div>
      </div>
    );
  }

  // Error State
  if (error || !product) {
    return (
      <div className="product-page">
        <header className="product-header">
          <button className="btn btn-icon" onClick={() => navigate(-1)}>
            <FiArrowLeft size={24} />
          </button>
        </header>
        <div className="product-error">
          <div className="error-icon">😕</div>
          <h2>Product Not Found</h2>
          <p>{error || "The product you're looking for doesn't exist or has been removed."}</p>
          <button className="btn btn-primary" onClick={() => navigate('/store')}>
            Browse Menu
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="product-page">
      {/* Header */}
      <header className="product-header">
        <button className="btn btn-icon" onClick={() => navigate(-1)}>
          <FiArrowLeft size={24} />
        </button>
        <div className="header-actions">
          <button 
            className={`btn btn-icon ${isFavorite ? 'favorite active' : ''}`}
            onClick={handleToggleFavorite}
            disabled={favoriteLoading}
            aria-pressed={isFavorite}
          >
            {isFavorite ? <AiFillHeart size={20} color="#e74c3c" /> : <FiHeart size={20} />}
          </button>
        </div>
      </header>

      {/* Product Image */}
      <div className="product-image-section">
        {product.image ? (
          <img 
            src={product.image} 
            alt={product.name} 
            className="product-image"
          />
        ) : (
          <div className="product-image-placeholder">
            <span>🍽️</span>
          </div>
        )}
        {!product.available && (
          <div className="unavailable-badge">Currently Unavailable</div>
        )}
      </div>

      {/* Product Info */}
      <div className="product-content">
        {/* Basic Info */}
        <div className="product-info-section">
          <span className="product-category">{getCategoryLabel(product.category)}</span>
          <h1 className="product-name">{product.name}</h1>
          
          <div className="product-meta">
            <div className="product-rating">
              <FiStar className="star-icon" />
              <span>{product.rating || '4.5'}</span>
              <span className="rating-count">({product.reviewCount || '120'}+ reviews)</span>
            </div>
            <div className="product-time">
              <FiClock size={14} />
              <span>15-20 min</span>
            </div>
          </div>
          
          <p className="product-description">{product.description}</p>
          
          <div className="product-price-section">
            <span className="product-price">Rs {product.price?.toFixed(2)}</span>
          </div>
        </div>

        {/* Size Selection */}
        <div className="options-section">
          <h3>Size</h3>
          <div className="size-options">
            {sizes.map((size) => (
              <button
                key={size.name}
                className={`size-btn ${selectedSize === size.name ? 'active' : ''}`}
                onClick={() => setSelectedSize(size.name)}
              >
                <span className="size-name">{size.name}</span>
                {size.price > 0 && <span className="size-price">+Rs {size.price.toFixed(2)}</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Spice Level */}
        <div className="options-section">
          <h3>Spice Level</h3>
          <div className="spice-options">
            {spiceLevels.map((level) => (
              <button
                key={level}
                className={`spice-btn ${spiceLevel === level ? 'active' : ''}`}
                onClick={() => setSpiceLevel(level)}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        {/* Extras */}
        <div className="options-section">
          <h3>Add Extras</h3>
          <div className="extras-list">
            {extrasOptions.map((extra) => (
              <div 
                key={extra.id} 
                className={`extra-item ${extras[extra.id] ? 'selected' : ''}`}
                onClick={() => handleExtrasToggle(extra.id)}
              >
                <div className="extra-info">
                  <span className="extra-name">{extra.name}</span>
                  <span className="extra-price">+Rs {extra.price.toFixed(2)}</span>
                </div>
                <div className={`extra-checkbox ${extras[extra.id] ? 'checked' : ''}`}>
                  {extras[extra.id] && <FiCheck size={14} />}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Special Instructions */}
        <div className="options-section">
          <h3>Special Instructions <span className="optional-label">(Optional)</span></h3>
          <div className="instructions-list">
            {specialInstructions.map((instruction) => (
              <button
                key={instruction}
                className={`instruction-btn ${selectedInstructions.includes(instruction) ? 'active' : ''}`}
                onClick={() => handleInstructionToggle(instruction)}
              >
                {instruction}
              </button>
            ))}
          </div>
          <p className="instruction-hint">Select up to 2 instructions</p>
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="bottom-action-bar">
        <div className="quantity-control">
          <button 
            className="btn btn-icon qty-btn"
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            disabled={quantity <= 1}
          >
            <FiMinus size={20} />
          </button>
          <span className="quantity">{quantity}</span>
          <button 
            className="btn btn-icon qty-btn"
            onClick={() => setQuantity(quantity + 1)}
          >
            <FiPlus size={20} />
          </button>
        </div>
        <button 
          className="btn btn-primary add-to-cart-btn" 
          onClick={handleAddToCart}
          disabled={!product.available || adding}
        >
          {adding ? (
            <><FiCheck size={20} /> Added to Cart!</>
          ) : (
            product.available ? `Add to Cart • Rs ${calculateTotal()}` : 'Unavailable'
          )}
        </button>
      </div>

      {/* local toast removed; using global toast */}
    </div>
  );
};

export default ProductPage;

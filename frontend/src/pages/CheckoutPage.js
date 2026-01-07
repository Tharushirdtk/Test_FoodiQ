import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { FiArrowLeft, FiMapPin, FiCreditCard, FiPlus, FiAlertCircle } from 'react-icons/fi';
import orderService from '../services/orderService';
import paymentService from '../services/paymentService';
import addressService from '../services/addressService';
import PhoneVerificationModal from '../components/PhoneVerificationModal';
import Dropdown from '../components/Dropdown';
import '../styles/CheckoutPage.css';

const CheckoutPage = () => {
  const navigate = useNavigate();
  const { cartItems, getCartTotal, clearCart } = useCart();
  const { user, isAuthenticated, isGuest } = useAuth();
  
  const [activeTab, setActiveTab] = useState('Delivery');
  const [deliveryNote, setDeliveryNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [selectedAddressType, setSelectedAddressType] = useState('House');
  const [showAddAddressForm, setShowAddAddressForm] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(user?.phoneVerified || false);
  const [orderError, setOrderError] = useState('');
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [newAddress, setNewAddress] = useState({
    type: 'Home',
    street: '',
    city: '',
    zip: ''
  });

  const [savedAddresses, setSavedAddresses] = useState([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await addressService.getAddresses();
        if (!mounted) return;
        const list = Array.isArray(data) ? data : data.addresses || [];
        setSavedAddresses(list);
        if (list.length > 0) setSelectedAddressType(list[0]._id || list[0].id);
      } catch (err) {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, []);

  const handleAddAddress = () => {
    (async () => {
      if (newAddress.street && newAddress.city && newAddress.zip) {
        try {
          const created = await addressService.createAddress({ type: newAddress.type, street: newAddress.street, city: newAddress.city, zip: newAddress.zip });
          const toAdd = created?.address || created || { ...newAddress, id: savedAddresses.length + 1 };
          setSavedAddresses([...savedAddresses, toAdd]);
          setNewAddress({ type: 'Home', street: '', city: '', zip: '' });
          setShowAddAddressForm(false);
          setSelectedAddressType(toAdd._id || toAdd.id || toAdd.type);
        } catch (e) {
          // fallback to local add
          const newAddr = {
            id: savedAddresses.length + 1,
            type: newAddress.type,
            street: newAddress.street,
            city: newAddress.city,
            zip: newAddress.zip
          };
          setSavedAddresses([...savedAddresses, newAddr]);
          setNewAddress({ type: 'Home', street: '', city: '', zip: '' });
          setShowAddAddressForm(false);
          setSelectedAddressType(newAddr.type);
        }
      }
    })();
  };

  const currentAddress = savedAddresses.find(addr => (addr._id || addr.id) === selectedAddressType) || savedAddresses[0];
  
  const formatAddress = (addr) => {
    const zipCode = addr.postalCode || addr.zip || '';
    const state = addr.state || '';
    return {
      fullStreet: addr.street || '',
      cityStateZip: `${addr.city || ''}${state ? ', ' + state : ''}${zipCode ? ' ' + zipCode : ''}`
    };
  };

  const formattedCurrentAddress = formatAddress(currentAddress || { street: '', city: '', zip: '' });

  const subtotal = getCartTotal();
  const deliveryFee = cartItems.length > 0 ? 200.00 : 0;
  const salesTax = cartItems.length > 0 ? 50.00 : 0;
  const discount = cartItems.length > 0 ? 150.00 : 0;
  const total = subtotal + deliveryFee + salesTax - discount;

  // Check if phone verification is required for placing order
  const requiresPhoneVerification = isAuthenticated && !isGuest && user?.phone && !phoneVerified;

  const handleVerificationSuccess = () => {
    setPhoneVerified(true);
    setShowVerifyModal(false);
  };

  const handlePlaceOrder = async () => {
    // Check phone verification for authenticated users
    if (isAuthenticated && !isGuest && user?.phone && !phoneVerified) {
      setShowVerifyModal(true);
      return;
    }

    setOrderError('');
    setIsPlacingOrder(true);

    try {
      const items = cartItems.map((it) => ({
        productId: it.id,
        quantity: it.quantity,
        options: it.options || {
          size: it.size || null,
          spiceLevel: it.spiceLevel || null,
          extras: it.extras || [],
          instructions: it.instructions || ''
        }
      }));

      const addressId = currentAddress ? (currentAddress._id || currentAddress.id) : null;

      // Build payload with addressId and fallback address object
      const payload = { 
        items, 
        addressId, 
        payment: { method: paymentMethod } 
      };

      // Include full address object as fallback (for guests or unsaved addresses)
      if (currentAddress) {
        payload.address = {
          label: currentAddress.label || currentAddress.type || 'Home',
          street: currentAddress.street,
          city: currentAddress.city,
          postalCode: currentAddress.postalCode || currentAddress.zip
        };
      }

      const res = await orderService.createOrder(payload);
      const orderId = res?.orderId || (res.order && res.order._id) || res._id;

      // If payment required (card/paypal/gpay), create payment intent (mock)
      if (paymentMethod && paymentMethod !== 'cash' && orderId) {
        const amount = total;
        try {
          await paymentService.createPaymentIntent({ orderId, amount });
          // In a real flow we'd redirect to payment provider / collect card details
        } catch (e) {
          // ignore payment creation failure for now
        }
      }

      clearCart();
      navigate('/orders');
    } catch (err) {
      console.error('Place order failed', err);
      const errorMsg = err?.response?.data?.message || 'Could not place order. Please try again.';
      
      // If product not found, suggest clearing cart
      if (errorMsg.includes('not found')) {
        setOrderError(`${errorMsg}. This item may no longer be available. Please go back to cart and remove unavailable items.`);
      } else {
        setOrderError(errorMsg);
      }
    } finally {
      setIsPlacingOrder(false);
    }
  };

  return (
    <div className="checkout-page">
      {/* Header */}
      <header className="checkout-header">
        <button className="btn btn-icon" onClick={() => navigate('/cart')}>
          <FiArrowLeft size={24} />
        </button>
        <h1>Checkout</h1>
        <div style={{ width: '40px' }}></div>
      </header>

      {/* Step Indicator */}
      <div className="step-indicator">
        <div className="step active">
          <div className="step-number">1</div>
          <span>Cart</span>
        </div>
        <div className="step-line"></div>
        <div className="step active">
          <div className="step-number">2</div>
          <span>Checkout</span>
        </div>
        <div className="step-line"></div>
        <div className="step">
          <div className="step-number">3</div>
          <span>Order</span>
        </div>
      </div>

      <div className="checkout-content">
        {/* Delivery/Pickup Tabs */}
        <div className="service-tabs">
          <button
            className={`tab-btn ${activeTab === 'Delivery' ? 'active' : ''}`}
            onClick={() => setActiveTab('Delivery')}
          >
            Delivery
          </button>
          <button
            className={`tab-btn ${activeTab === 'Pickup' ? 'active' : ''}`}
            onClick={() => setActiveTab('Pickup')}
          >
            Pickup
          </button>
        </div>

        {/* Delivery Address */}
        <div className="section">
          <div className="section-header">
            <h2>Delivery Address</h2>
            <button className="btn-text" onClick={() => setShowAddAddressForm(!showAddAddressForm)}>
              <FiPlus size={16} /> Add New
            </button>
          </div>

          {showAddAddressForm && (
            <div className="add-address-form">
              <h3 className="form-title">Add New Delivery Address</h3>
              
              <div className="form-group">
                <label>Address Type</label>
                <Dropdown
                  options={[
                    { value: 'Home', label: 'Home' },
                    { value: 'Work', label: 'Work' },
                    { value: 'Other', label: 'Other' },
                    { value: 'Gym', label: 'Gym' },
                    { value: 'Hotel', label: 'Hotel' },
                  ]}
                  value={newAddress.type}
                  onChange={(val) => setNewAddress({ ...newAddress, type: val })}
                  placeholder="Select type"
                />
              </div>

              <div className="form-group">
                <label>Street Address *</label>
                <input
                  type="text"
                  placeholder="123 Main Street"
                  value={newAddress.street}
                  onChange={(e) => setNewAddress({ ...newAddress, street: e.target.value })}
                  className="address-input"
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>City *</label>
                  <input
                    type="text"
                    placeholder="Colombo"
                    value={newAddress.city}
                    onChange={(e) => setNewAddress({ ...newAddress, city: e.target.value })}
                    className="address-input"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>ZIP Code *</label>
                  <input
                    type="text"
                    placeholder="90012"
                    value={newAddress.zip}
                    onChange={(e) => setNewAddress({ ...newAddress, zip: e.target.value })}
                    className="address-input"
                    maxLength="5"
                    required
                  />
                </div>
              </div>

              <div className="form-actions">
                <button className="btn btn-secondary" onClick={() => setShowAddAddressForm(false)}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleAddAddress}>
                  Save Address
                </button>
              </div>
            </div>
          )}

          {currentAddress ? (
            <div className="address-card">
              <div className="address-icon">
                <FiMapPin size={24} color="#FF6B35" />
              </div>
              <div className="address-info">
                <div className="address-type">{currentAddress.label || currentAddress.type || 'Address'}</div>
                <div className="address-text">{formattedCurrentAddress.fullStreet}</div>
                <div className="address-city">{formattedCurrentAddress.cityStateZip}</div>
              </div>
              <div className="address-actions">
                {savedAddresses.map((addr) => (
                  <button
                    key={addr._id || addr.id}
                    className={`btn btn-sm ${selectedAddressType === (addr._id || addr.id) ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setSelectedAddressType(addr._id || addr.id)}
                  >
                    {addr.label || addr.type || 'Address'}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="no-address-card">
              <p>No delivery address saved. Please add one above.</p>
            </div>
          )}
        </div>

        {/* Delivery Note */}
        <div className="section">
          <h2>Delivery Note</h2>
          <textarea
            className="delivery-note-input"
            placeholder="Ring doorbell twice at front door..."
            value={deliveryNote}
            onChange={(e) => setDeliveryNote(e.target.value)}
            rows={3}
          />
        </div>

        {/* Order Summary */}
        <div className="section">
          <h2>Order Summary</h2>
          <div className="order-items">
            {cartItems.map((item) => {
              const size = item.size || item.options?.size;
              const spiceLevel = item.spiceLevel || item.options?.spiceLevel;
              const extras = item.extras || item.options?.extras || [];
              const instructions = item.instructions || item.options?.instructions || [];
              
              return (
                <div key={item.id} className="order-item">
                  <div className="order-item-image">
                    {item.image && item.image.startsWith('http') ? (
                      <img src={item.image} alt={item.name} />
                    ) : (
                      <span className="item-emoji">{item.image || '🍽️'}</span>
                    )}
                  </div>
                  <div className="order-item-info">
                    <h4>{item.name}</h4>
                    <p className="item-customizations">
                      {size && <span>{size}</span>}
                      {size && spiceLevel && ' • '}
                      {spiceLevel && <span>{spiceLevel}</span>}
                    </p>
                    {extras.length > 0 && (
                      <p className="item-extras-summary">
                        + {extras.map(e => typeof e === 'string' ? e : e.name).join(', ')}
                      </p>
                    )}
                    {instructions.length > 0 && (
                      <p className="item-instructions-summary">
                        📝 {Array.isArray(instructions) ? instructions.join(', ') : instructions}
                      </p>
                    )}
                  </div>
                  <div className="order-item-qty">x{item.quantity}</div>
                  <div className="order-item-price">
                    Rs {(item.price * item.quantity).toFixed(2)}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="order-totals">
            <div className="total-row">
              <span>Subtotal</span>
              <span>Rs {subtotal.toFixed(2)}</span>
            </div>
            <div className="total-row">
              <span>Delivery Fee</span>
              <span>Rs {deliveryFee.toFixed(2)}</span>
            </div>
            <div className="total-row">
              <span>Sales Tax</span>
              <span>Rs {salesTax.toFixed(2)}</span>
            </div>
            <div className="total-row discount">
              <span>Discount</span>
              <span>-Rs {discount.toFixed(2)}</span>
            </div>
            <div className="total-row grand-total">
              <span>Total</span>
              <span>Rs {total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Payment Method */}
        <div className="section">
          <h2>Payment Method</h2>
          <div className="payment-methods">
            <label className={`payment-option ${paymentMethod === 'cash' ? 'active' : ''}`}>
              <input
                type="radio"
                name="payment"
                value="cash"
                checked={paymentMethod === 'cash'}
                onChange={(e) => setPaymentMethod(e.target.value)}
              />
              <div className="payment-icon">💵</div>
              <span>Cash</span>
            </label>

            <label className={`payment-option ${paymentMethod === 'card' ? 'active' : ''}`}>
              <input
                type="radio"
                name="payment"
                value="card"
                checked={paymentMethod === 'card'}
                onChange={(e) => setPaymentMethod(e.target.value)}
              />
              <div className="payment-icon">
                <FiCreditCard size={24} />
              </div>
              <span>Credit Card</span>
            </label>

            <label className={`payment-option ${paymentMethod === 'debit' ? 'active' : ''}`}>
              <input
                type="radio"
                name="payment"
                value="debit"
                checked={paymentMethod === 'debit'}
                onChange={(e) => setPaymentMethod(e.target.value)}
              />
              <div className="payment-icon">💳</div>
              <span>Debit Card</span>
            </label>

            <label className={`payment-option ${paymentMethod === 'paypal' ? 'active' : ''}`}>
              <input
                type="radio"
                name="payment"
                value="paypal"
                checked={paymentMethod === 'paypal'}
                onChange={(e) => setPaymentMethod(e.target.value)}
              />
              <div className="payment-icon">🅿️</div>
              <span>PayPal</span>
            </label>

            <label className={`payment-option ${paymentMethod === 'gpay' ? 'active' : ''}`}>
              <input
                type="radio"
                name="payment"
                value="gpay"
                checked={paymentMethod === 'gpay'}
                onChange={(e) => setPaymentMethod(e.target.value)}
              />
              <div className="payment-icon">🔵</div>
              <span>Google Pay</span>
            </label>

            <label className={`payment-option ${paymentMethod === 'applepay' ? 'active' : ''}`}>
              <input
                type="radio"
                name="payment"
                value="applepay"
                checked={paymentMethod === 'applepay'}
                onChange={(e) => setPaymentMethod(e.target.value)}
              />
              <div className="payment-icon">🍎</div>
              <span>Apple Pay</span>
            </label>
          </div>
        </div>

        {/* Phone Verification Warning */}
        {requiresPhoneVerification && (
          <div className="verification-warning">
            <FiAlertCircle size={20} />
            <div className="warning-content">
              <p className="warning-title">Phone verification required</p>
              <p className="warning-text">Please verify your phone number to place an order.</p>
            </div>
            <button 
              className="btn btn-small verify-now-btn" 
              onClick={() => setShowVerifyModal(true)}
            >
              Verify Now
            </button>
          </div>
        )}
      </div>

      {/* Place Order Button */}
      <div className="place-order-bar">
        {orderError && (
          <div className="order-error">
            <FiAlertCircle size={16} />
            <span>{orderError}</span>
            {orderError.includes('not found') && (
              <button 
                className="clear-cart-link"
                onClick={() => {
                  clearCart();
                  navigate('/store');
                }}
              >
                Clear Cart & Browse Menu
              </button>
            )}
          </div>
        )}
        <button 
          className={`btn btn-primary place-order-btn ${requiresPhoneVerification ? 'requires-verification' : ''}`} 
          onClick={handlePlaceOrder}
          disabled={isPlacingOrder}
        >
          {isPlacingOrder 
            ? 'Placing Order...' 
            : requiresPhoneVerification 
              ? 'Verify Phone to Order' 
              : `Place Order • Rs ${total.toFixed(2)}`}
        </button>
      </div>

      {/* Phone Verification Modal */}
      {user?.phone && (
        <PhoneVerificationModal
          isOpen={showVerifyModal}
          onClose={() => setShowVerifyModal(false)}
          phone={user.phone}
          onVerified={handleVerificationSuccess}
        />
      )}
    </div>
  );
};

export default CheckoutPage;

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { FiTrash2, FiMinus, FiPlus, FiTag, FiCheck, FiX, FiLoader, FiPhone, FiMapPin, FiUser, FiCreditCard, FiChevronDown, FiEdit2 } from 'react-icons/fi';
import contactService from '../services/contactService';
import addressService from '../services/addressService';
import paymentService from '../services/paymentService';
import profileService from '../services/profileService';
import voucherService from '../services/voucherService';
import PhoneVerificationModal from '../components/PhoneVerificationModal';
import '../styles/CartPage.css';

const CartPage = () => {
  const navigate = useNavigate();
  const { user, isGuest } = useAuth();
  const { cartItems, updateQuantity, removeFromCart, getCartTotal, clearCart } = useCart();
  
  // Order details state
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [orderLoading, setOrderLoading] = useState(false);
  
  // Data lists
  const [contacts, setContacts] = useState([]);
  const [addresses, setAddresses] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  
  // Selected items (primary by default)
  const [selectedContact, setSelectedContact] = useState(null);
  const [selectedAddress, setSelectedAddress] = useState(null);
  const [selectedPayment, setSelectedPayment] = useState(null);
  
  // Display name
  const [displayName, setDisplayName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);
  
  // Dropdowns open state
  const [openDropdown, setOpenDropdown] = useState(null);
  const dropdownRef = useRef(null);
  
  // Phone verification
  const [showPhoneVerification, setShowPhoneVerification] = useState(false);
  const [contactToVerify, setContactToVerify] = useState(null);

  // Voucher state
  const [voucherCode, setVoucherCode] = useState('');
  const [voucherLoading, setVoucherLoading] = useState(false);
  const [appliedVoucher, setAppliedVoucher] = useState(null);
  const [voucherError, setVoucherError] = useState('');

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (openDropdown && dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpenDropdown(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openDropdown]);

  // Calculate totals dynamically
  const subtotal = getCartTotal();
  const deliveryFee = cartItems.length > 0 ? 200.00 : 0;
  const salesTax = cartItems.length > 0 ? 50.00 : 0;
  
  // Calculate discount from voucher
  const calculateDiscount = () => {
    if (!appliedVoucher) return 0;
    if (appliedVoucher.discountType === 'percent') {
      return (subtotal * appliedVoucher.amount) / 100;
    }
    return appliedVoucher.amount; // flat amount
  };
  const discount = calculateDiscount();
  const total = Math.max(0, subtotal + deliveryFee + salesTax - discount);

  const fetchOrderDetails = async () => {
    if (isGuest) return;
    
    setOrderLoading(true);
    
    try {
      // Fetch all data in parallel
      const [contactsData, addressData, paymentData] = await Promise.all([
        contactService.getContacts(),
        addressService.getAddresses(),
        paymentService.getPaymentMethods()
      ]);

      // Handle different response formats
      const contactsList = Array.isArray(contactsData) ? contactsData : contactsData?.contacts || [];
      const addressList = Array.isArray(addressData) ? addressData : addressData?.addresses || [];
      const paymentList = Array.isArray(paymentData) ? paymentData : paymentData?.methods || [];

      console.log('Fetched contacts:', contactsList);
      console.log('Fetched addresses:', addressList);
      console.log('Fetched payments:', paymentList);

      setContacts(contactsList);
      setAddresses(addressList);
      setPaymentMethods(paymentList);

      // Set primary/default selections
      const primaryContact = contactsList.find(c => c.isPrimary) || contactsList.find(c => c.verified) || contactsList[0];
      const primaryAddress = addressList.find(a => a.isPrimary || a.isDefault) || addressList[0];
      const primaryPayment = paymentList.find(p => p.isPrimary || p.isDefault) || paymentList[0];

      setSelectedContact(primaryContact || null);
      setSelectedAddress(primaryAddress || null);
      setSelectedPayment(primaryPayment || null);

      // Set display name from user
      setDisplayName(user?.displayName || user?.name || user?.firstName || '');

    } catch (error) {
      console.error('Error fetching order details:', error);
    } finally {
      setOrderLoading(false);
    }
  };

  const handleProceed = () => {
    if (isGuest) {
      navigate('/account');
      return;
    }
    setShowOrderModal(true);
    fetchOrderDetails();
  };

  const handleSaveDisplayName = async () => {
    if (!displayName.trim()) return;
    
    setSavingName(true);
    try {
      await profileService.updateProfile({ displayName: displayName.trim() });
      setIsEditingName(false);
    } catch (error) {
      console.error('Error saving display name:', error);
    } finally {
      setSavingName(false);
    }
  };

  const handleVerifyContact = (contact) => {
    setContactToVerify(contact);
    setShowPhoneVerification(true);
  };

  const handlePhoneVerificationSuccess = () => {
    setShowPhoneVerification(false);
    setContactToVerify(null);
    // Refresh contacts
    fetchOrderDetails();
  };

  // Voucher handlers
  const handleApplyVoucher = async () => {
    if (!voucherCode.trim()) {
      setVoucherError('Please enter a voucher code');
      return;
    }

    setVoucherLoading(true);
    setVoucherError('');

    try {
      const result = await voucherService.validate(voucherCode.trim());
      if (result.valid) {
        setAppliedVoucher({
          code: voucherCode.trim().toUpperCase(),
          discountType: result.discountType,
          amount: result.amount
        });
        setVoucherError('');
      } else {
        setVoucherError(result.message || 'Invalid voucher');
        setAppliedVoucher(null);
      }
    } catch (err) {
      const msg = err?.response?.data?.message || 'Failed to validate voucher';
      setVoucherError(msg);
      setAppliedVoucher(null);
    } finally {
      setVoucherLoading(false);
    }
  };

  const handleRemoveVoucher = () => {
    setAppliedVoucher(null);
    setVoucherCode('');
    setVoucherError('');
  };

  const canProceedToCheckout = () => {
    // Must have verified contact, address, and payment method
    const hasVerifiedContact = selectedContact?.verified;
    const hasAddress = !!selectedAddress;
    const hasPayment = !!selectedPayment;
    const hasDisplayName = displayName.trim().length > 0;
    
    return hasVerifiedContact && hasAddress && hasPayment && hasDisplayName;
  };

  const handleCheckout = () => {
    if (cartItems.length > 0 && canProceedToCheckout()) {
      // Store selected options for checkout page
      sessionStorage.setItem('orderDetails', JSON.stringify({
        contactId: selectedContact?._id,
        addressId: selectedAddress?._id,
        paymentMethodId: selectedPayment?._id,
        displayName: displayName.trim()
      }));
      setShowOrderModal(false);
      navigate('/checkout');
    }
  };

  const toggleDropdown = (dropdown) => {
    setOpenDropdown(openDropdown === dropdown ? null : dropdown);
  };

  const formatCardNumber = (cardNumber) => {
    if (!cardNumber) return '•••• ••••';
    const last4 = cardNumber.slice(-4);
    return `•••• •••• •••• ${last4}`;
  };

  return (
    <div className="cart-page">
      {/* Header */}
      <header className="cart-header">
        <button className="btn btn-icon logo-btn" onClick={() => navigate('/')}>
          <img src="/images/logo.png" alt="FoodIQ" className="header-logo-small" />
        </button>
        <h1>My Cart ({cartItems.length} items)</h1>
        <button className="btn-text clear-btn" onClick={clearCart}>
          Clear All
        </button>
      </header>

      <div className="cart-content">
        {cartItems.length === 0 ? (
          <div className="empty-cart">
            <div className="empty-icon">🛒</div>
            <h2>Your cart is empty</h2>
            <p>Add some delicious items to get started!</p>
            <button className="btn btn-primary" onClick={() => navigate('/')}>
              Browse Menu
            </button>
          </div>
        ) : (
          <>
            {/* Cart Items */}
            <div className="cart-items">
              {cartItems.map((item) => {
                const apiId = item.cartItemId || item.id;
                return (
                <div key={item.id} className="cart-item">
                  <div className="item-image">
                    {item.image && item.image.startsWith('http') ? (
                      <img src={item.image} alt={item.name} />
                    ) : (
                      <span className="item-emoji">{item.image || '🍽️'}</span>
                    )}
                  </div>
                  <div className="item-details">
                    <h3>{item.name}</h3>
                    {item.description && (
                      <p className="item-description">{item.description}</p>
                    )}
                    {/* Show customization options */}
                    <div className="item-options">
                      {(item.size || item.options?.size) && (
                        <span className="option-tag size-tag">{item.size || item.options?.size}</span>
                      )}
                      {(item.spiceLevel || item.options?.spiceLevel) && (
                        <span className="option-tag spice-tag">{item.spiceLevel || item.options?.spiceLevel}</span>
                      )}
                    </div>
                    {((item.extras && item.extras.length > 0) || (item.options?.extras && item.options.extras.length > 0)) && (
                      <p className="item-extras">
                        + {(item.extras || item.options?.extras || []).map(e => typeof e === 'string' ? e : e.name).join(', ')}
                      </p>
                    )}
                    {((item.instructions && item.instructions.length > 0) || (item.options?.instructions && item.options.instructions.length > 0)) && (
                      <p className="item-instructions">
                        📝 {Array.isArray(item.instructions || item.options?.instructions) 
                          ? (item.instructions || item.options?.instructions).join(', ')
                          : (item.instructions || item.options?.instructions)}
                      </p>
                    )}
                    <div className="item-footer">
                      <span className="item-price">Rs {(item.price * item.quantity).toFixed(2)}</span>
                      <div className="quantity-control">
                        <button 
                          className="qty-btn"
                            onClick={() => item.quantity > 1 && updateQuantity(apiId, item.quantity - 1)}
                            disabled={item.quantity <= 1}
                        >
                          <FiMinus size={16} />
                        </button>
                        <span className="quantity">{item.quantity}</span>
                        <button 
                          className="qty-btn"
                          onClick={() => updateQuantity(apiId, item.quantity + 1)}
                        >
                          <FiPlus size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                  <button 
                    className="delete-btn"
                    onClick={() => removeFromCart(apiId)}
                  >
                    <FiTrash2 size={18} />
                  </button>
                </div>
              )})}
            </div>

            {/* Frequently Bought Together - Commented out for now
            <div className="frequently-bought">
              <h3>Frequently bought together</h3>
              <div className="addon-list">
                {frequentlyBought.map((addon) => (
                  <div key={addon.id} className="addon-item">
                    <div className="addon-image">
                      <img src={addon.image} alt={addon.name} />
                    </div>
                    <div className="addon-info">
                      <h4>{addon.name}</h4>
                      <span className="addon-price">Rs {addon.price.toFixed(2)}</span>
                    </div>
                    <button 
                      className="btn-add"
                      onClick={() => addToCart(addon)}
                    >
                      <FiPlus size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            */}

            {/* Voucher Code */}
            <div className="voucher-section">
              {appliedVoucher ? (
                <div className="applied-voucher">
                  <div className="voucher-info">
                    <FiTag color="#4CAF50" size={20} />
                    <div className="voucher-details">
                      <span className="voucher-code-applied">{appliedVoucher.code}</span>
                      <span className="voucher-savings">
                        {appliedVoucher.discountType === 'percent' 
                          ? `${appliedVoucher.amount}% off` 
                          : `Rs ${appliedVoucher.amount.toFixed(2)} off`}
                      </span>
                    </div>
                  </div>
                  <button className="btn-remove-voucher" onClick={handleRemoveVoucher}>
                    <FiX size={18} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="voucher-input">
                    <FiTag color="#FF6B35" size={20} />
                    <input 
                      type="text" 
                      placeholder="Enter Voucher Code" 
                      value={voucherCode}
                      onChange={(e) => {
                        setVoucherCode(e.target.value.toUpperCase());
                        setVoucherError('');
                      }}
                      onKeyPress={(e) => e.key === 'Enter' && handleApplyVoucher()}
                    />
                  </div>
                  <button 
                    className="btn btn-primary voucher-btn"
                    onClick={handleApplyVoucher}
                    disabled={voucherLoading}
                  >
                    {voucherLoading ? <FiLoader className="spin" size={16} /> : 'Apply'}
                  </button>
                </>
              )}
            </div>
            {voucherError && (
              <p className="voucher-error">{voucherError}</p>
            )}

            {/* Order Summary */}
            <div className="order-summary">
              <div className="summary-row">
                <span>Subtotal</span>
                <span>Rs {subtotal.toFixed(2)}</span>
              </div>
              <div className="summary-row">
                <span>Delivery Fee</span>
                <span>Rs {deliveryFee.toFixed(2)}</span>
              </div>
              <div className="summary-row">
                <span>Sales Tax</span>
                <span>Rs {salesTax.toFixed(2)}</span>
              </div>
              {discount > 0 && (
                <div className="summary-row discount">
                  <span>Discount ({appliedVoucher?.code})</span>
                  <span className="discount-amount">-Rs {discount.toFixed(2)}</span>
                </div>
              )}
              <div className="summary-row total">
                <span>Total</span>
                <span>Rs {total.toFixed(2)}</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Checkout Button */}
      {cartItems.length > 0 && (
        <div className="checkout-bar">
          <button 
            className="btn btn-primary checkout-btn"
            onClick={handleProceed}
          >
            Proceed • Rs {total.toFixed(2)}
          </button>
        </div>
      )}

      {/* Order Details Modal */}
      {showOrderModal && (
        <div className="verification-modal-overlay">
          <div className="verification-modal order-details-modal">
            <div className="verification-modal-header">
              <h2>Order Details</h2>
              <button 
                className="close-btn"
                onClick={() => setShowOrderModal(false)}
              >
                <FiX size={24} />
              </button>
            </div>

            {orderLoading ? (
              <div className="verification-loading">
                <FiLoader className="spinner" size={40} />
                <p>Loading your details...</p>
              </div>
            ) : (
              <>
                <div className="order-details-content" ref={dropdownRef}>
                  {/* Display Name */}
                  <div className="order-detail-section">
                    <div className="section-header">
                      <div className="section-icon">
                        <FiUser size={20} />
                      </div>
                      <span className="section-title">Display Name</span>
                    </div>
                    <div className="section-content">
                      {isEditingName ? (
                        <div className="name-edit-wrapper">
                          <input
                            type="text"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            placeholder="Enter your name"
                            className="name-input"
                            autoFocus
                          />
                          <button 
                            className="btn btn-sm btn-save"
                            onClick={handleSaveDisplayName}
                            disabled={savingName || !displayName.trim()}
                          >
                            {savingName ? <FiLoader className="spinner" size={14} /> : 'Save'}
                          </button>
                          <button 
                            className="btn btn-sm btn-cancel"
                            onClick={() => setIsEditingName(false)}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="selected-value" onClick={() => setIsEditingName(true)}>
                          <span>{displayName || 'Enter your name'}</span>
                          <FiEdit2 size={16} />
                        </div>
                      )}
                    </div>
                    {!displayName.trim() && (
                      <span className="field-error">Display name is required</span>
                    )}
                  </div>

                  {/* Contact Selection */}
                  <div className="order-detail-section">
                    <div className="section-header">
                      <div className="section-icon">
                        <FiPhone size={20} />
                      </div>
                      <span className="section-title">Contact Number</span>
                    </div>
                    <div className="section-content">
                      {contacts.length === 0 ? (
                        <button 
                          className="btn btn-add-new"
                          onClick={() => navigate('/account', { state: { openSection: 'contact' } })}
                        >
                          + Add Contact
                        </button>
                      ) : (
                        <div className="custom-select-wrapper">
                          <div 
                            className={`custom-select ${openDropdown === 'contact' ? 'open' : ''}`}
                            onClick={() => toggleDropdown('contact')}
                          >
                            <div className="selected-option">
                              {selectedContact ? (
                                <>
                                  <span className="option-text">
                                    {selectedContact.number}
                                    {selectedContact.label && ` (${selectedContact.label})`}
                                  </span>
                                  {selectedContact.verified ? (
                                    <span className="verified-badge"><FiCheck size={12} /> Verified</span>
                                  ) : (
                                    <span className="unverified-badge">Not Verified</span>
                                  )}
                                </>
                              ) : (
                                <span className="placeholder">Select contact</span>
                              )}
                              <FiChevronDown className={`chevron ${openDropdown === 'contact' ? 'rotated' : ''}`} />
                            </div>
                            {openDropdown === 'contact' && (
                              <div className="options-list">
                                {contacts.map((contact) => (
                                  <div 
                                    key={contact._id} 
                                    className={`option ${selectedContact?._id === contact._id ? 'selected' : ''}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedContact(contact);
                                      setOpenDropdown(null);
                                    }}
                                  >
                                    <span className="option-text">
                                      {contact.number}
                                      {contact.label && ` (${contact.label})`}
                                    </span>
                                    {contact.verified ? (
                                      <span className="verified-badge small"><FiCheck size={10} /></span>
                                    ) : (
                                      <button 
                                        className="btn-verify-inline"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleVerifyContact(contact);
                                        }}
                                      >
                                        Verify
                                      </button>
                                    )}
                                  </div>
                                ))}
                                <div 
                                  className="option add-new"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate('/account', { state: { openSection: 'contact' } });
                                  }}
                                >
                                  + Add New Contact
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    {selectedContact && !selectedContact.verified && (
                      <div className="verify-prompt">
                        <span>This contact needs verification</span>
                        <button 
                          className="btn btn-sm btn-verify"
                          onClick={() => handleVerifyContact(selectedContact)}
                        >
                          Verify Now
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Address Selection */}
                  <div className="order-detail-section">
                    <div className="section-header">
                      <div className="section-icon">
                        <FiMapPin size={20} />
                      </div>
                      <span className="section-title">Delivery Address</span>
                    </div>
                    <div className="section-content">
                      {addresses.length === 0 ? (
                        <button 
                          className="btn btn-add-new"
                          onClick={() => navigate('/account/addresses')}
                        >
                          + Add Address
                        </button>
                      ) : (
                        <div className="custom-select-wrapper">
                          <div 
                            className={`custom-select ${openDropdown === 'address' ? 'open' : ''}`}
                            onClick={() => toggleDropdown('address')}
                          >
                            <div className="selected-option">
                              {selectedAddress ? (
                                <span className="option-text address-text">
                                  {selectedAddress.label && <strong>{selectedAddress.label}: </strong>}
                                  {selectedAddress.street || selectedAddress.addressLine1}
                                  {selectedAddress.city && `, ${selectedAddress.city}`}
                                </span>
                              ) : (
                                <span className="placeholder">Select address</span>
                              )}
                              <FiChevronDown className={`chevron ${openDropdown === 'address' ? 'rotated' : ''}`} />
                            </div>
                            {openDropdown === 'address' && (
                              <div className="options-list">
                                {addresses.map((address) => (
                                  <div 
                                    key={address._id} 
                                    className={`option ${selectedAddress?._id === address._id ? 'selected' : ''}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedAddress(address);
                                      setOpenDropdown(null);
                                    }}
                                  >
                                    <span className="option-text address-text">
                                      {address.label && <strong>{address.label}: </strong>}
                                      {address.street || address.addressLine1}
                                      {address.city && `, ${address.city}`}
                                    </span>
                                    {(address.isPrimary || address.isDefault) && (
                                      <span className="primary-badge">Primary</span>
                                    )}
                                  </div>
                                ))}
                                <div 
                                  className="option add-new"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate('/account/addresses');
                                  }}
                                >
                                  + Add New Address
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Payment Method Selection */}
                  <div className="order-detail-section">
                    <div className="section-header">
                      <div className="section-icon">
                        <FiCreditCard size={20} />
                      </div>
                      <span className="section-title">Payment Method</span>
                    </div>
                    <div className="section-content">
                      {paymentMethods.length === 0 ? (
                        <button 
                          className="btn btn-add-new"
                          onClick={() => navigate('/account/payment')}
                        >
                          + Add Payment Method
                        </button>
                      ) : (
                        <div className="custom-select-wrapper">
                          <div 
                            className={`custom-select ${openDropdown === 'payment' ? 'open' : ''}`}
                            onClick={() => toggleDropdown('payment')}
                          >
                            <div className="selected-option">
                              {selectedPayment ? (
                                <span className="option-text">
                                  {selectedPayment.cardType || selectedPayment.type || 'Card'} {formatCardNumber(selectedPayment.cardNumber || selectedPayment.last4)}
                                </span>
                              ) : (
                                <span className="placeholder">Select payment method</span>
                              )}
                              <FiChevronDown className={`chevron ${openDropdown === 'payment' ? 'rotated' : ''}`} />
                            </div>
                            {openDropdown === 'payment' && (
                              <div className="options-list">
                                {paymentMethods.map((payment) => (
                                  <div 
                                    key={payment._id} 
                                    className={`option ${selectedPayment?._id === payment._id ? 'selected' : ''}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedPayment(payment);
                                      setOpenDropdown(null);
                                    }}
                                  >
                                    <span className="option-text">
                                      {payment.cardType || payment.type || 'Card'} {formatCardNumber(payment.cardNumber || payment.last4)}
                                    </span>
                                    {(payment.isPrimary || payment.isDefault) && (
                                      <span className="primary-badge">Primary</span>
                                    )}
                                  </div>
                                ))}
                                <div 
                                  className="option add-new"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate('/account/payment');
                                  }}
                                >
                                  + Add New Payment Method
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="verification-modal-footer">
                  <button 
                    className="btn btn-secondary"
                    onClick={() => setShowOrderModal(false)}
                  >
                    Cancel
                  </button>
                  <button 
                    className="btn btn-primary"
                    onClick={handleCheckout}
                    disabled={!canProceedToCheckout()}
                  >
                    Continue to Checkout
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Phone Verification Modal */}
      {showPhoneVerification && contactToVerify && (
        <PhoneVerificationModal
          isOpen={showPhoneVerification}
          onClose={() => {
            setShowPhoneVerification(false);
            setContactToVerify(null);
          }}
          phone={contactToVerify.number}
          contactId={contactToVerify._id}
          onVerified={handlePhoneVerificationSuccess}
        />
      )}
    </div>
  );
};

export default CartPage;

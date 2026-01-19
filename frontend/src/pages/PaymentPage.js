import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiPlus, FiTrash2, FiX, FiStar } from 'react-icons/fi';
import paymentService from '../services/paymentService';
import QuickNavSidebar from '../components/QuickNavSidebar';
import ConfirmDialog from '../components/ConfirmDialog';
import Dropdown from '../components/Dropdown';
import '../styles/SubPage.css';

// Card brand SVG icons
const CardBrandIcon = ({ brand }) => {
  const icons = {
    Visa: (
      <svg viewBox="0 0 48 32" style={{ width: 40, height: 28 }}>
        <rect width="48" height="32" rx="4" fill="#1A1F71"/>
        <path d="M19.5 21H17L15 11H17.5L19.5 21ZM14 11L11.5 18L11 16L10 11.5C10 11.5 9.9 11 9.3 11H6L6 11.2C6 11.2 7.3 11.5 8.5 12.3L10.5 21H13L16 11H14ZM32 21L32 11L29.5 11L25 18L24.5 11L22 11L22.5 21L25 21L29.5 14L30 21L32 21ZM36 11L33.5 21H36L38.5 11H36Z" fill="white"/>
      </svg>
    ),
    Mastercard: (
      <svg viewBox="0 0 48 32" style={{ width: 40, height: 28 }}>
        <rect width="48" height="32" rx="4" fill="#000"/>
        <circle cx="18" cy="16" r="10" fill="#EB001B"/>
        <circle cx="30" cy="16" r="10" fill="#F79E1B"/>
        <path d="M24 8.5a10 10 0 0 0 0 15a10 10 0 0 0 0-15z" fill="#FF5F00"/>
      </svg>
    ),
    Amex: (
      <svg viewBox="0 0 48 32" style={{ width: 40, height: 28 }}>
        <rect width="48" height="32" rx="4" fill="#006FCF"/>
        <text x="24" y="20" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">AMEX</text>
      </svg>
    ),
    Card: (
      <svg viewBox="0 0 48 32" style={{ width: 40, height: 28 }}>
        <rect width="48" height="32" rx="4" fill="#9E9E9E"/>
        <rect x="4" y="10" width="40" height="4" fill="#666"/>
        <rect x="4" y="18" width="20" height="3" rx="1" fill="#CCC"/>
      </svg>
    )
  };
  return icons[brand] || icons.Card;
};

const PaymentPage = () => {
  const navigate = useNavigate();
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [formData, setFormData] = useState({
    cardNumber: '',
    expiryMonth: '',
    expiryYear: '',
    cvv: ''
  });

  useEffect(() => {
    loadPaymentMethods();
  }, []);

  const loadPaymentMethods = async () => {
    try {
      setLoading(true);
      const data = await paymentService.getPaymentMethods();
      setPaymentMethods(data || []);
    } catch (err) {
      setError('Failed to load payment methods');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Format card number with spaces
  const formatCardNumber = (value) => {
    const v = value.replace(/\s+/g, '').replace(/\D/g, '').slice(0, 16);
    const parts = [];
    for (let i = 0; i < v.length; i += 4) {
      parts.push(v.slice(i, i + 4));
    }
    return parts.join(' ');
  };

  // Get raw card number without spaces
  const getRawCardNumber = (formatted) => {
    return formatted.replace(/\s+/g, '');
  };

  const getCardBrand = (number) => {
    const raw = getRawCardNumber(number);
    const firstDigit = raw?.charAt(0);
    const firstTwo = raw?.slice(0, 2);
    if (firstDigit === '4') return 'Visa';
    if (['51', '52', '53', '54', '55'].includes(firstTwo) || (parseInt(firstTwo) >= 22 && parseInt(firstTwo) <= 27)) return 'Mastercard';
    if (['34', '37'].includes(firstTwo)) return 'Amex';
    return 'Card';
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setFormData({ cardNumber: '', expiryMonth: '', expiryYear: '', cvv: '' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const rawNumber = getRawCardNumber(formData.cardNumber);
    try {
      await paymentService.addPaymentMethod({
        type: 'card',
        last4: rawNumber.slice(-4),
        brand: getCardBrand(formData.cardNumber),
        expiryMonth: parseInt(formData.expiryMonth),
        expiryYear: parseInt(formData.expiryYear)
      });
      loadPaymentMethods();
      handleCloseModal();
    } catch (err) {
      setError('Failed to add payment method');
    }
  };

  const handleDelete = (id) => {
    setDeletingId(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!deletingId) return;
    try {
      await paymentService.deletePaymentMethod(deletingId);
      loadPaymentMethods();
    } catch (err) {
      setError('Failed to remove payment method');
    } finally {
      setShowDeleteConfirm(false);
      setDeletingId(null);
    }
  };

  const handleSetDefault = async (id) => {
    try {
      await paymentService.setDefaultPaymentMethod(id);
      loadPaymentMethods();
    } catch (err) {
      setError('Failed to set primary payment method');
    }
  };

  return (
    <div className="sub-page">
      <header className="sub-header">
        <button className="back-btn" onClick={() => navigate('/account')}>
          <FiArrowLeft size={24} />
        </button>
        <h1>Payment Methods</h1>
        <button className="header-action" onClick={() => setShowModal(true)}>
          <FiPlus size={20} />
        </button>
      </header>

      <div className="sub-content">
        {error && <div className="error-message">{error}</div>}

        {loading ? (
          <div className="loading-spinner-container">
            <div className="loading-spinner"></div>
          </div>
        ) : paymentMethods.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">💳</div>
            <h3>No payment methods</h3>
            <p>Add a card for faster checkout</p>
            <button className="btn" onClick={() => setShowModal(true)}>
              Add Card
            </button>
          </div>
        ) : (
          <>
            {/* Info Section - At top of cards */}
            <div style={{ 
              marginBottom: 16, 
              padding: 16, 
              background: 'var(--bg-white)', 
              borderRadius: 12,
              boxShadow: '0 2px 8px var(--shadow-color)'
            }}>
              <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--text-dark)' }}>
                🔒 Secure Payments
              </h4>
              <p style={{ fontSize: 13, color: 'var(--text-gray)', margin: 0, lineHeight: 1.6 }}>
                Your payment information is encrypted and securely processed. We never store your full card details.
              </p>
            </div>
            
            <div className="card-list">
              {paymentMethods.map(method => (
                <div key={method._id} className="card-item" style={{ cursor: 'default' }}>
                  <div className="card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <CardBrandIcon brand={method.brand} />
                      <div>
                        <h3 className="card-title">{method.brand} •••• {method.last4}</h3>
                        <p style={{ fontSize: 13, color: 'var(--text-gray)', margin: 0 }}>
                          Expires {method.expiryMonth}/{method.expiryYear}
                        </p>
                      </div>
                    </div>
                    {method.isDefault && (
                      <span className="card-badge primary">
                        <FiStar size={12} /> Primary
                      </span>
                    )}
                  </div>
                  <div className="card-actions" style={{ marginTop: 12 }}>
                    {!method.isDefault && (
                      <button 
                        className="card-action-btn primary"
                        onClick={() => handleSetDefault(method._id)}
                      >
                        <FiStar size={14} /> Set Primary
                      </button>
                    )}
                    <button 
                      className="card-action-btn danger"
                      onClick={() => handleDelete(method._id)}
                    >
                      <FiTrash2 size={14} /> Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Add Card Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Card</h2>
              <button className="modal-close" onClick={handleCloseModal}>
                <FiX size={24} />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Card Number</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      value={formData.cardNumber}
                      onChange={e => setFormData({ ...formData, cardNumber: formatCardNumber(e.target.value) })}
                      placeholder="1234 5678 9012 3456"
                      required
                      maxLength={19}
                      style={{ paddingRight: 50 }}
                    />
                    <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}>
                      <CardBrandIcon brand={getCardBrand(formData.cardNumber)} />
                    </div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label>Month</label>
                    <Dropdown
                      options={[
                        { value: '', label: 'MM' },
                        ...Array.from({ length: 12 }, (_, i) => ({
                          value: String(i + 1).padStart(2, '0'),
                          label: String(i + 1).padStart(2, '0'),
                        })),
                      ]}
                      value={formData.expiryMonth}
                      onChange={(val) => setFormData({ ...formData, expiryMonth: val })}
                      placeholder="MM"
                      size="sm"
                    />
                  </div>
                  <div className="form-group">
                    <label>Year</label>
                    <Dropdown
                      options={[
                        { value: '', label: 'YY' },
                        ...Array.from({ length: 10 }, (_, i) => {
                          const year = new Date().getFullYear() + i;
                          return { value: String(year), label: String(year) };
                        }),
                      ]}
                      value={formData.expiryYear}
                      onChange={(val) => setFormData({ ...formData, expiryYear: val })}
                      placeholder="YY"
                      size="sm"
                    />
                  </div>
                  <div className="form-group">
                    <label>CVV</label>
                    <input
                      type="password"
                      value={formData.cvv}
                      onChange={e => setFormData({ ...formData, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                      placeholder="•••"
                      required
                      maxLength={4}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-cancel" onClick={handleCloseModal}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-submit">
                  Add Card
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bottom navigation is now rendered globally in App.js */}
      
      {/* Quick Navigation Sidebar */}
      <QuickNavSidebar />

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => { setShowDeleteConfirm(false); setDeletingId(null); }}
        onConfirm={confirmDelete}
        title="Remove Payment Method"
        message="Are you sure you want to remove this payment method?"
        confirmText="Remove"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
};

export default PaymentPage;

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import LoadingSpinner from '../components/LoadingSpinner';
import cartService from '../services/cartService';
import { useAuth } from '../context/AuthContext';
import { FiTrash2, FiMinus, FiPlus, FiTag, FiCheck, FiX, FiLoader, FiPhone, FiMapPin, FiUser, FiCreditCard, FiChevronDown, FiEdit2 } from 'react-icons/fi';
import contactService from '../services/contactService';
import addressService from '../services/addressService';
import paymentService from '../services/paymentService';
import profileService from '../services/profileService';
import voucherService from '../services/voucherService';
import PhoneVerificationModal from '../components/PhoneVerificationModal';
import '../styles/CartPage.css';
import EditAttributesModal from '../components/EditAttributesModal';
import productService from '../services/productService';
import { computeOrderTotals } from '../utils/computeOrderTotals';

const computeAttributeAmount = (a, basePrice) => {
  const pt = String(a.priceType || 'flat').toLowerCase();
  const qty = Number(a.quantity || 1) || 1;
  const amount = Number(a.amount || 0);
  if (pt === 'percent') {
    return Math.round((basePrice * (amount / 100)) * 100) / 100 * qty;
  }
  if (pt === 'minus-percent') {
    // Per requested mapping: minus-percent -> - amount * quantity
    return - (Math.round(amount * 100) / 100) * qty;
  }
  if (pt === 'minus-flat') {
    // Per requested mapping: minus-flat -> - (base * (amount/100)) * quantity
    return - (Math.round((basePrice * (amount / 100)) * 100) / 100) * qty;
  }
  // flat
  return (Math.round(amount * 100) / 100) * qty;
};

const CartPage = () => {
  const navigate = useNavigate();
  const { user, isGuest } = useAuth();
  const { cartItems, updateQuantity, removeFromCart, getCartTotal, clearCart, loading, refreshCart } = useCart();
  const { updateItemAttributes } = useCart();
  
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
  const [editingItem, setEditingItem] = useState(null);
  const [editingProduct, setEditingProduct] = useState(null);
  const [editingSelectedAttributes, setEditingSelectedAttributes] = useState([]);
  const [editingLoading, setEditingLoading] = useState(false);
  const [savingAttributes, setSavingAttributes] = useState(false);
  const [editingValidationError, setEditingValidationError] = useState('');
  const dropdownRef = useRef(null);

  // Helper: remove any `defaultSelected` flags from attributeGroups when showing in edit modal
  const stripDefaults = (ags = []) => (ags || []).map(g => ({
    ...g,
    attributes: (g.attributes || []).map(a => ({ ...(a || {}), defaultSelected: false }))
  }));
  
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

  // Ensure cart is freshly loaded when this page mounts
  useEffect(() => {
    (async () => {
      try {
        if (refreshCart) await refreshCart();
      } catch (e) {
        // ignore
      }
    })();
  }, [refreshCart]);

  // Calculate totals dynamically using backend-consistent helper
  const subtotal = getCartTotal();
  const promoForCalc = appliedVoucher ? { discountType: appliedVoucher.discountType, amount: appliedVoucher.amount } : null;
  const totals = computeOrderTotals(cartItems.map(it => ({ price: (Number(it.price || 0) + Number(it.attributesTotal || 0)), quantity: it.quantity, vendor: it.vendor })), promoForCalc);
  const deliveryFee = totals.deliveryFee;
  const salesTax = totals.salesTax;
  const platformFee = totals.platformFee;
  const discount = totals.promoAmount;
  const total = totals.total;

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

  useEffect(() => {
    console.log('[CartPage] cartItems changed:', cartItems);
    console.log('[CartPage] subtotal:', subtotal);
    console.log('[CartPage] totals:', { deliveryFee, salesTax, platformFee, discount, total });
  }, [cartItems, subtotal, deliveryFee, salesTax, platformFee, discount, total]);

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
        displayName: displayName.trim(),
        appliedVoucher: appliedVoucher || null
      }));
      setShowOrderModal(false);
      navigate('/checkout');
    }
  };

  const openEditAttributes = async (item) => {
    // Show modal and display authoritative cart item + product attributes while loading
    setEditingLoading(true);
    setEditingItem(null);
    setEditingProduct(null);
    setEditingSelectedAttributes([]);

    try {
      // Fetch authoritative cart from server and find this item
      const cartResp = await cartService.getCart();
      const items = Array.isArray(cartResp) ? cartResp : (cartResp && cartResp.items) || [];
      const apiId = item.cartItemId || item.id;
      const authoritative = items.find(it => (it.cartItemId || it.id) === apiId) || item;

      // set authoritative item into modal
      setEditingItem(authoritative);
      console.log('[CartPage.openEditAttributes] authoritative item:', authoritative);

      // normalize existing selections from authoritative cart item
      // Prefer `options.selectedAttributes` (original selections) and merge with stored snapshots
      const optsSel = (authoritative.options && Array.isArray(authoritative.options.selectedAttributes)) ? authoritative.options.selectedAttributes : [];
      const snapSel = (authoritative.selectedAttributes && Array.isArray(authoritative.selectedAttributes)) ? authoritative.selectedAttributes : [];
      console.log('[CartPage.openEditAttributes] optsSel:', optsSel);
      console.log('[CartPage.openEditAttributes] snapSel:', snapSel);
      const existingMap = new Map();
      optsSel.forEach(s => existingMap.set(String(s.id || s._id || s.attributeId || s.name), s));
      snapSel.forEach(s => {
        const key = String(s.id || s._id || s.attributeId || s.name);
        if (!existingMap.has(key)) existingMap.set(key, s);
      });
      const existing = Array.from(existingMap.values());

      const normalized = (existing || []).map(s => ({
        groupKey: s.groupKey || s.group || s.group_name || s.groupKey || '',
        id: s.id || s._id || s.attributeId || s.attribute || s.name,
        name: s.name || s.label || '',
        priceType: s.priceType || s.type || 'flat',
        amount: typeof s.amount !== 'undefined' ? s.amount : (s.computedAmount || 0),
        quantity: s.quantity || 1
      }));
      setEditingSelectedAttributes(normalized);

      // Use embedded product attributeGroups from authoritative cart item when available
      const prodId = authoritative.productId || authoritative.product || authoritative.id || item.productId || item.product || item.id;
      let latestAGs = [];
      try {
        if (authoritative && authoritative.product && Array.isArray(authoritative.product.attributeGroups) && authoritative.product.attributeGroups.length) {
          latestAGs = authoritative.product.attributeGroups;
        } else if (prodId) {
          const resp = await productService.getProduct(prodId);
          const prod = (resp && (resp.product || resp)) || null;
          latestAGs = Array.isArray(prod?.attributeGroups) ? prod.attributeGroups : (prod?.attributeGroups || []);
        }

        setEditingProduct({ attributeGroups: stripDefaults(latestAGs) });

        // Reconcile selections: map existing selected ids to latest attribute definitions
        const flatAttrs = [];
        latestAGs.forEach((g) => {
          (g.attributes || []).forEach((a) => {
            flatAttrs.push({
              id: String(a._id || a.id || a.name),
              groupKey: g.key || g.title || '',
              name: a.name,
              priceType: a.priceType || 'flat',
              amount: a.amount || 0,
              quantity: 1,
            });
          });
        });

        const reconciled = normalized.map((sel) => {
          const found = flatAttrs.find(f => String(f.id) === String(sel.id) || String(f.name) === String(sel.id));
          if (found) return { ...found, quantity: sel.quantity || 1 };
          return sel;
        });

        const singleGroups = latestAGs.filter(g => g.type === 'single-select').map(g => (g.key || g.title || '').toString().toLowerCase());
        const finalSelections = [];
        for (const sel of reconciled) {
          const gk = (sel.groupKey || '').toString().toLowerCase();
          if (singleGroups.includes(gk)) {
            if (!finalSelections.some(f => (f.groupKey || '').toString().toLowerCase() === gk)) {
              finalSelections.push(sel);
            }
          } else finalSelections.push(sel);
        }

        setEditingSelectedAttributes(finalSelections);
      } catch (err) {
        console.warn('Failed to refresh product attributes for edit modal', err);
      }
    } catch (err) {
      // fallback to snapshot item if anything fails
      console.warn('Failed to fetch authoritative cart for edit modal', err);
      setEditingItem(item);
    } finally {
      setEditingLoading(false);
    }
  };

  const closeEditModal = () => {
    setEditingItem(null);
    setEditingProduct(null);
    setEditingSelectedAttributes([]);
  };

  const saveEditingAttributes = async () => {
    if (!editingItem) return;
    if (savingAttributes) return; // already saving
    // perform validation against attributeGroups' requiredMin
    setEditingValidationError('');
    const ags = (editingProduct && editingProduct.attributeGroups) || (editingItem && editingItem.product && editingItem.product.attributeGroups) || [];
    const missing = [];
    if (Array.isArray(ags) && ags.length) {
      for (const g of ags) {
        const req = Number(g.requiredMin || 0);
        if (req > 0) {
          const key = (g.key || g.title || '').toString().toLowerCase();
          const count = (editingSelectedAttributes || []).filter(s => (s.groupKey || '').toString().toLowerCase() === key).length;
          if (count < req) missing.push({ group: g.title || g.key || key, required: req, found: count });
        }
      }
    }

    if (missing.length > 0) {
      const first = missing[0];
      setEditingValidationError(`Please select at least ${first.required} option${first.required > 1 ? 's' : ''} for "${first.group}".`);
      return;
    }

    setSavingAttributes(true);
    try {
      // call context helper
      await updateItemAttributes(editingItem.cartItemId || editingItem.id, editingSelectedAttributes);
      closeEditModal();
    } catch (e) {
      // errors are handled in context (toasts); keep modal open for retry
    } finally {
      setSavingAttributes(false);
    }
  };

  // clear validation error when user changes selections
  useEffect(() => {
    if (editingSelectedAttributes && editingSelectedAttributes.length >= 0) setEditingValidationError('');
  }, [editingSelectedAttributes]);

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
        {loading ? (
          <div className="cart-loading-wrapper">
            <LoadingSpinner />
            <p>Loading your cart...</p>
          </div>
        ) : cartItems.length === 0 ? (
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
                <div key={apiId} className="cart-item">
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
                    {/* Show selectedAttributes snapshot if present */}
                      {((item.selectedAttributes && item.selectedAttributes.length > 0) || item.size) && (
                        <div className="item-attributes">
                          {(() => {
                            const attrs = (item.options && Array.isArray(item.options.selectedAttributes) && item.options.selectedAttributes.length)
                              ? item.options.selectedAttributes
                              : (item.selectedAttributes || []);
                            // ensure size group shown even if amounts are zero
                            const groups = attrs.reduce((acc, a) => {
                              const key = a.groupKey || a.group || 'Options';
                              if (!acc[key]) acc[key] = [];
                              acc[key].push(a);
                              return acc;
                            }, {});
                            if (item.size && !Object.keys(groups).some(k => /size/i.test(k))) {
                              groups['Size'] = [{ name: item.size, amount: 0 }];
                            }

                            // Build entries with metadata so we can order groups:
                            // 1) size group first
                            // 2) groups with only non-zero selected attrs
                            // 3) mixed groups (some zero, some non-zero)
                            // 4) zero-only groups
                            const entries = Object.entries(groups).map(([gName, list]) => {
                              const isSizeGroup = /size/i.test(gName);
                              const nonZeroAttrs = list.filter((a) => {
                                const computed = (typeof a.computedAmount !== 'undefined') ? Number(a.computedAmount) : Number(a.amount || 0);
                                return isSizeGroup || Number(computed) !== 0;
                              });
                              const zeroAttrs = list.filter(a => !nonZeroAttrs.includes(a));
                              return { gName, list, isSizeGroup, nonZeroAttrs, zeroAttrs };
                            });

                            // extract size entry and classify the rest
                            const sizeEntryIndex = entries.findIndex(e => e.isSizeGroup);
                            let sizeEntry = null;
                            if (sizeEntryIndex >= 0) sizeEntry = entries.splice(sizeEntryIndex, 1)[0];

                            const nonZeroOnly = [];
                            const mixed = [];
                            const zeroOnly = [];
                            entries.forEach((e) => {
                              if (e.nonZeroAttrs.length > 0 && e.zeroAttrs.length === 0) nonZeroOnly.push(e);
                              else if (e.nonZeroAttrs.length > 0 && e.zeroAttrs.length > 0) mixed.push(e);
                              else zeroOnly.push(e);
                            });

                            const ordered = [];
                            if (sizeEntry) ordered.push(sizeEntry);
                            ordered.push(...nonZeroOnly, ...mixed, ...zeroOnly);

                            return ordered.map(({ gName, list, isSizeGroup, nonZeroAttrs, zeroAttrs }) => {
                              if ((!nonZeroAttrs || nonZeroAttrs.length === 0) && (!zeroAttrs || zeroAttrs.length === 0)) return null;
                              return (
                                <div key={gName} className="attr-group">
                                  {(() => {
                                    const keyLower = (gName || '').toString().toLowerCase();
                                    const match = (item.attributeGroups || []).find(g => ((g.key || g.title || '').toString().toLowerCase() === keyLower));
                                    const display = match ? (match.title || match.key) : (gName === 'Options' ? 'Options' : gName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
                                    return <span className="group-name">{display}</span>;
                                  })()}
                                  <div className="group-tags">
                                    <div className="left-tags">
                                      {nonZeroAttrs.map((a, idx) => {
                                        const amt = (typeof a.computedAmount !== 'undefined') ? Number(a.computedAmount) : computeAttributeAmount(a, Number(item.price || 0));
                                        return (
                                          <span key={idx} className="option-tag attribute-tag">
                                            {a.name}{a.quantity && a.quantity > 1 ? ` x${a.quantity}` : ''}
                                            {!isSizeGroup && Number(amt) !== 0 ? (
                                              <span className="attr-amt">{Number(amt) >= 0 ? ` +\u00A0Rs\u00A0${Number(amt).toFixed(2)}` : ` -\u00A0Rs\u00A0${Math.abs(Number(amt)).toFixed(2)}`}</span>
                                            ) : null}
                                          </span>
                                        );
                                      })}
                                    </div>
                                    <div className="right-tags">
                                      {zeroAttrs.map((a, idx) => {
                                        const amt = (typeof a.computedAmount !== 'undefined') ? Number(a.computedAmount) : computeAttributeAmount(a, Number(item.price || 0));
                                        return (
                                          <span key={`z-${idx}`} className="option-tag attribute-tag zero">
                                            {a.name}{a.quantity && a.quantity > 1 ? ` x${a.quantity}` : ''}
                                            {!isSizeGroup && Number(amt) !== 0 ? (
                                              <span className="attr-amt">{Number(amt) >= 0 ? ` +\u00A0Rs\u00A0${Number(amt).toFixed(2)}` : ` -\u00A0Rs\u00A0${Math.abs(Number(amt)).toFixed(2)}`}</span>
                                            ) : null}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>
                              );
                            });
                          })()}
                          {typeof item.attributesTotal !== 'undefined' && Number(item.attributesTotal) !== 0 && (
                            <div className="attribute-total">{Number(item.attributesTotal) > 0 ? `+\u00A0Rs\u00A0${Number(item.attributesTotal).toFixed(2)}` : `-\u00A0Rs\u00A0${Math.abs(Number(item.attributesTotal)).toFixed(2)}`}</div>
                          )}
                        </div>
                      )}
                    {((item.instructions && item.instructions.length > 0) || (item.options?.instructions && item.options.instructions.length > 0)) && (
                      <p className="item-instructions">
                        📝 {Array.isArray(item.instructions || item.options?.instructions) 
                          ? (item.instructions || item.options?.instructions).join(', ')
                          : (item.instructions || item.options?.instructions)}
                      </p>
                    )}
                    <div className="item-footer">
                      <span className="item-price">Rs {((Number(item.price || 0) + Number(item.attributesTotal || 0)) * Number(item.quantity || 1)).toFixed(2)}</span>
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
                  <div className="item-actions">
                    <button 
                      className="delete-btn"
                      onClick={() => removeFromCart(apiId)}
                      aria-label="Remove item"
                    >
                      <FiTrash2 size={18} />
                    </button>
                    <button className="delete-btn edit-btn" onClick={() => openEditAttributes(item)} aria-label="Edit item">
                      <FiEdit2 size={18} />
                    </button>
                  </div>
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

                  {/* Edit Attributes Modal (moved below) */}
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
                <span>Platform Fee</span>
                <span>Rs {platformFee.toFixed(2)}</span>
              </div>
              <div className="summary-row">
                <span>Sales Tax</span>
                <span>Rs {salesTax.toFixed(2)}</span>
              </div>
              {discount > 0 && (
                <div className="summary-row discount">
                  <span>{`Promo code - ${appliedVoucher?.code}`}</span>
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
      {/* Edit Attributes Modal Component */}
      <EditAttributesModal
        editingItem={editingItem}
        editingProduct={editingProduct}
        selectedAttributes={editingSelectedAttributes}
        setSelectedAttributes={setEditingSelectedAttributes}
        onClose={closeEditModal}
        onSave={saveEditingAttributes}
        validationError={editingValidationError}
        saving={savingAttributes}
        loading={editingLoading}
      />
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

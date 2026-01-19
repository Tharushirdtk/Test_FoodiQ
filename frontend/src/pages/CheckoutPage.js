import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useCart } from "../context/CartContext";
import LoadingSpinner from "../components/LoadingSpinner";
import { useAuth } from "../context/AuthContext";
import {
  FiArrowLeft,
  FiMapPin,
  FiCreditCard,
  FiPlus,
  FiAlertCircle,
  FiCheck,
} from "react-icons/fi";
import orderService from "../services/orderService";
import paymentService from "../services/paymentService";
import addressService from "../services/addressService";
import PhoneVerificationModal from "../components/PhoneVerificationModal";
import Dropdown from "../components/Dropdown";
import "../styles/CheckoutPage.css";
import { computeOrderTotals } from '../utils/computeOrderTotals';

const CheckoutPage = () => {
  const navigate = useNavigate();
  const { cartItems, getCartTotal, clearCart, loading } = useCart();
  const { user, isAuthenticated, isGuest } = useAuth();

  const [activeTab, setActiveTab] = useState("Delivery");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [appliedVoucher, setAppliedVoucher] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentMethodsList, setPaymentMethodsList] = useState([]);
  const [selectedCardId, setSelectedCardId] = useState(null);
  const cardPickerRef = React.useRef(null);
  const [selectedAddressType, setSelectedAddressType] = useState("House");
  const [showAddAddressForm, setShowAddAddressForm] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(
    user?.phoneVerified || false
  );
  const [orderError, setOrderError] = useState("");
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [newAddress, setNewAddress] = useState({
    type: "Home",
    street: "",
    city: "",
    zip: "",
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

    // Load any orderDetails stored by CartPage (applied voucher, selections)
    try {
      const raw = sessionStorage.getItem('orderDetails');
      if (raw) {
        const od = JSON.parse(raw);
        if (od && od.appliedVoucher) setAppliedVoucher(od.appliedVoucher);
        // If cart modal saved a selected payment method id (a saved card), use it as selectedCardId
        if (od && od.paymentMethodId) {
          setSelectedCardId(od.paymentMethodId);
          // set payment method to card when we have a saved card id
          setPaymentMethod('card');
        }
      }
    } catch (e) {}
    return () => {
      mounted = false;
    };
  }, []);

  // Fetch user's saved payment methods (cards)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (isAuthenticated && !isGuest) {
          const pm = await paymentService.getPaymentMethods();
          const list = Array.isArray(pm) ? pm : pm.methods || [];
          if (!mounted) return;
          setPaymentMethodsList(list);
          // If no selectedCardId yet, pick primary
          if (!selectedCardId && list.length > 0) {
            const primary = list.find((p) => p.isPrimary || p.isDefault) || list[0];
            if (primary) setSelectedCardId(primary._id || primary.id || null);
          }
        }
      } catch (e) {
        /* ignore */
      }
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, isGuest]);

  // Scroll card picker into view when paymentMethod switches to card/debit
  useEffect(() => {
    try {
      if ((paymentMethod === 'card' || paymentMethod === 'debit') && cardPickerRef.current) {
        cardPickerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } catch (e) {}
  }, [paymentMethod]);

  const handleAddAddress = () => {
    (async () => {
      if (newAddress.street && newAddress.city && newAddress.zip) {
        try {
          const created = await addressService.createAddress({
            type: newAddress.type,
            street: newAddress.street,
            city: newAddress.city,
            zip: newAddress.zip,
          });
          const toAdd = created?.address ||
            created || { ...newAddress, id: savedAddresses.length + 1 };
          setSavedAddresses([...savedAddresses, toAdd]);
          setNewAddress({ type: "Home", street: "", city: "", zip: "" });
          setShowAddAddressForm(false);
          setSelectedAddressType(toAdd._id || toAdd.id || toAdd.type);
        } catch (e) {
          // fallback to local add
          const newAddr = {
            id: savedAddresses.length + 1,
            type: newAddress.type,
            street: newAddress.street,
            city: newAddress.city,
            zip: newAddress.zip,
          };
          setSavedAddresses([...savedAddresses, newAddr]);
          setNewAddress({ type: "Home", street: "", city: "", zip: "" });
          setShowAddAddressForm(false);
          setSelectedAddressType(newAddr.type);
        }
      }
    })();
  };

  const currentAddress =
    savedAddresses.find(
      (addr) => (addr._id || addr.id) === selectedAddressType
    ) || savedAddresses[0];

  const formatAddress = (addr) => {
    const zipCode = addr.postalCode || addr.zip || "";
    const state = addr.state || "";
    return {
      fullStreet: addr.street || "",
      cityStateZip: `${addr.city || ""}${state ? ", " + state : ""}${
        zipCode ? " " + zipCode : ""
      }`,
    };
  };

  const formattedCurrentAddress = formatAddress(
    currentAddress || { street: "", city: "", zip: "" }
  );

  const subtotal = getCartTotal();
  const promoForCalc = appliedVoucher ? { discountType: appliedVoucher.discountType || appliedVoucher.type, amount: appliedVoucher.amount } : null;
  const totals = computeOrderTotals(cartItems.map(it => ({ price: it.price, quantity: it.quantity, vendor: it.vendor })), promoForCalc);
  const deliveryFee = totals.deliveryFee;
  const salesTax = totals.salesTax;
  const platformFee = totals.platformFee;
  const discount = totals.promoAmount;
  const total = totals.total;

  // Check if phone verification is required for placing order
  const requiresPhoneVerification =
    isAuthenticated && !isGuest && user?.phone && !phoneVerified;

  const handleVerificationSuccess = () => {
    setPhoneVerified(true);
    setShowVerifyModal(false);
  };

  const handlePlaceOrder = async () => {
    // Require a selected payment method
    if (!paymentMethod) {
      setOrderError("Please select a payment method before placing the order.");
      return;
    }
    // If payment method requires a saved card, ensure one is selected
    if ((paymentMethod === 'card' || paymentMethod === 'debit') && !selectedCardId) {
      setOrderError('Please select a saved card to pay with or add a card.');
      return;
    }

    // Check phone verification for authenticated users
    if (isAuthenticated && !isGuest && user?.phone && !phoneVerified) {
      setShowVerifyModal(true);
      return;
    }

    setOrderError("");
    setIsPlacingOrder(true);

    try {
      const items = cartItems.map((it) => ({
        productId: it.id,
        quantity: it.quantity,
        options: it.options || {
          size: it.size || null,
          spiceLevel: it.spiceLevel || null,
          extras: it.extras || [],
          instructions: it.instructions || "",
          selectedAttributes: it.selectedAttributes || it.options?.selectedAttributes || []
        },
      }));

      const addressId = currentAddress
        ? currentAddress._id || currentAddress.id
        : null;

      // Build payload with addressId and fallback address object
      const payload = {
        items,
        addressId,
        payment: { method: paymentMethod },
        deliveryNote: deliveryNote || "",
        serviceType: (activeTab === 'Pickup' ? 'pickup' : 'delivery'),
      };

      if (selectedCardId && (paymentMethod === 'card' || paymentMethod === 'debit')) {
        payload.payment.cardId = selectedCardId;
      }
         if (appliedVoucher) {
           payload.promoAmount = Number(discount || 0);
           payload.promoCode = appliedVoucher.code || '';
           payload.appliedVoucher = appliedVoucher;
         }

      // Include full address object as fallback (for guests or unsaved addresses)
      if (currentAddress) {
        payload.address = {
          label: currentAddress.label || currentAddress.type || "Home",
          street: currentAddress.street,
          city: currentAddress.city,
          postalCode: currentAddress.postalCode || currentAddress.zip,
        };
      }

      const res = await orderService.createOrder(payload);
      const orderId = res?.orderId || (res.order && res.order._id) || res._id;

      // If payment required (card/paypal/gpay), create payment intent (mock)
      if (paymentMethod && paymentMethod !== "cash" && orderId) {
        const amount = total;
        try {
          await paymentService.createPaymentIntent({ orderId, amount });
          // In a real flow we'd redirect to payment provider / collect card details
        } catch (e) {
          // ignore payment creation failure for now
        }
      }

      clearCart();
      navigate("/orders");
    } catch (err) {
      console.error("Place order failed", err);
      const errorMsg =
        err?.response?.data?.message ||
        "Could not place order. Please try again.";

      // If product not found, suggest clearing cart
      if (errorMsg.includes("not found")) {
        setOrderError(
          `${errorMsg}. This item may no longer be available. Please go back to cart and remove unavailable items.`
        );
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
        <button className="btn btn-icon" onClick={() => navigate("/cart")}>
          <FiArrowLeft size={24} />
        </button>
        <h1>Checkout</h1>
        <div style={{ width: "40px" }}></div>
      </header>

      {/* Step Indicator */}
      {/* Step Indicator */}
      <div className="cp-step-indicator">
        <div className="cp-step-progress-line">
          <div className="cp-step-progress-fill" style={{ width: "66%" }}></div>
        </div>

        <div className="cp-step completed">
          <div className="cp-step-number">
            <FiCheck size={16} />
          </div>
          <span>Cart</span>
        </div>

        <div className="cp-step active">
          <div className="cp-step-number">2</div>
          <span>Checkout</span>
        </div>

        <div className="cp-step">
          <div className="cp-step-number">3</div>
          <span>Confirm</span>
        </div>
      </div>

      <div className="checkout-content">
        {/* Delivery/Pickup Tabs */}
        <div className="service-tabs">
          <button
            className={`tab-btn ${activeTab === "Delivery" ? "active" : ""}`}
            onClick={() => setActiveTab("Delivery")}
          >
            Delivery
          </button>
          <button
            className={`tab-btn ${activeTab === "Pickup" ? "active" : ""}`}
            onClick={() => setActiveTab("Pickup")}
          >
            Pickup
          </button>
        </div>

        {/* Delivery Address */}
        <div className="section">
          <div className="section-header">
            <h2>Delivery Address</h2>
            <button
              className="btn-text"
              onClick={() => setShowAddAddressForm(!showAddAddressForm)}
            >
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
                    { value: "Home", label: "Home" },
                    { value: "Work", label: "Work" },
                    { value: "Other", label: "Other" },
                    { value: "Gym", label: "Gym" },
                    { value: "Hotel", label: "Hotel" },
                  ]}
                  value={newAddress.type}
                  onChange={(val) =>
                    setNewAddress({ ...newAddress, type: val })
                  }
                  placeholder="Select type"
                />
              </div>

              <div className="form-group">
                <label>Street Address *</label>
                <input
                  type="text"
                  placeholder="123 Main Street"
                  value={newAddress.street}
                  onChange={(e) =>
                    setNewAddress({ ...newAddress, street: e.target.value })
                  }
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
                    onChange={(e) =>
                      setNewAddress({ ...newAddress, city: e.target.value })
                    }
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
                    onChange={(e) =>
                      setNewAddress({ ...newAddress, zip: e.target.value })
                    }
                    className="address-input"
                    maxLength="5"
                    required
                  />
                </div>
              </div>

              <div className="form-actions">
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowAddAddressForm(false)}
                >
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
                <div className="address-type">
                  {currentAddress.label || currentAddress.type || "Address"}
                </div>
                <div className="address-text">
                  {formattedCurrentAddress.fullStreet}
                </div>
                <div className="address-city">
                  {formattedCurrentAddress.cityStateZip}
                </div>
              </div>
              <div className="address-actions">
                {savedAddresses.map((addr) => (
                  <button
                    key={addr._id || addr.id}
                    className={`btn btn-sm ${
                      selectedAddressType === (addr._id || addr.id)
                        ? "btn-primary"
                        : "btn-secondary"
                    }`}
                    onClick={() => setSelectedAddressType(addr._id || addr.id)}
                  >
                    {addr.label || addr.type || "Address"}
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
          {loading ? (
            <div className="checkout-loading">
              <LoadingSpinner />
              <p>Loading cart...</p>
            </div>
          ) : (
            <div className="order-items">
              {cartItems.map((item) => {
                const apiId = item.cartItemId || item.id;
                const size = item.size || item.options?.size;
                const spiceLevel = item.spiceLevel || item.options?.spiceLevel;
                const extras = item.extras || item.options?.extras || [];
                const instructions =
                  item.instructions || item.options?.instructions || [];

                return (
                  <div key={apiId} className="order-item">
                    <div className="order-item-image">
                      {item.image && item.image.startsWith("http") ? (
                        <img src={item.image} alt={item.name} />
                      ) : (
                        <span className="item-emoji">{item.image || "🍽️"}</span>
                      )}
                    </div>
                    <div className="order-item-info">
                      <h4>{item.name}</h4>
                      <p className="item-customizations">
                        {size && <span>{size}</span>}
                        {size && spiceLevel && " • "}
                        {spiceLevel && <span>{spiceLevel}</span>}
                      </p>
                      {extras.length > 0 && (
                        <p className="item-extras-summary">
                          +{" "}
                          {extras
                            .map((e) => (typeof e === "string" ? e : e.name))
                            .join(", ")}
                        </p>
                      )}
                      {instructions.length > 0 && (
                        <p className="item-instructions-summary">
                          📝{" "}
                          {Array.isArray(instructions)
                            ? instructions.join(", ")
                            : instructions}
                        </p>
                      )}
                      {/* Show selected attributes snapshot if present */}
                      
                        {((item.selectedAttributes && item.selectedAttributes.length > 0) || item.size) && (
                          <div className="item-attributes-summary">
                            {(() => {
                              const attrs = (item.options && Array.isArray(item.options.selectedAttributes) && item.options.selectedAttributes.length)
                                ? item.options.selectedAttributes
                                : (item.selectedAttributes || []);
                              const groups = attrs.reduce((acc, a) => {
                                const key = a.groupKey || a.group || 'Options';
                                if (!acc[key]) acc[key] = [];
                                acc[key].push(a);
                                return acc;
                              }, {});
                              if (item.size && !Object.keys(groups).some(k => /size/i.test(k))) {
                                groups['Size'] = [{ name: item.size, amount: 0 }];
                              }
                              return Object.entries(groups).map(([gName, list]) => {
                                const isSizeGroup = /size/i.test(gName);
                                const visible = list.filter((a) => {
                                  const computed = (typeof a.computedAmount !== 'undefined') ? Number(a.computedAmount) : (function(){
                                    const pt = String(a.priceType || 'flat').toLowerCase();
                                    const qty = Number(a.quantity || 1) || 1;
                                    const amount = Number(a.amount || 0);
                                    const base = Number(item.price || 0);
                                    if (pt === 'percent') return Math.round((base * (amount / 100)) * 100) / 100 * qty;
                                    if (pt === 'minus-percent') return - (Math.round(amount * 100) / 100) * qty;
                                    if (pt === 'minus-flat') return - (Math.round((base * (amount / 100)) * 100) / 100) * qty;
                                    return (Math.round(amount * 100) / 100) * qty;
                                  })();
                                  return isSizeGroup || Number(computed) !== 0;
                                });
                                if (!visible || visible.length === 0) return null;
                                return (
                                  <div key={gName} className="attr-group">
                                    {(() => {
                                      const keyLower = (gName || '').toString().toLowerCase();
                                      const match = (item.attributeGroups || []).find(g => ((g.key || g.title || '').toString().toLowerCase() === keyLower));
                                      const display = match ? (match.title || match.key) : (gName === 'Options' ? 'Options' : gName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
                                      return <span className="group-name">{display}</span>;
                                    })()}
                                    <div className="group-tags">
                                      {visible.map((a, idx) => (
                                        <span key={idx} className="option-tag attribute-tag">
                                          {a.name}{a.quantity && a.quantity > 1 ? ` x${a.quantity}` : ''}
                                          {(() => {
                                            const amt = (typeof a.computedAmount !== 'undefined') ? Number(a.computedAmount) : (function(){
                                              const pt = String(a.priceType || 'flat').toLowerCase();
                                              const qty = Number(a.quantity || 1) || 1;
                                              const amount = Number(a.amount || 0);
                                              const base = Number(item.price || 0);
                                              if (pt === 'percent') return Math.round((base * (amount / 100)) * 100) / 100 * qty;
                                              if (pt === 'minus-percent') return - (Math.round(amount * 100) / 100) * qty;
                                              if (pt === 'minus-flat') return - (Math.round((base * (amount / 100)) * 100) / 100) * qty;
                                              return (Math.round(amount * 100) / 100) * qty;
                                            })();
                                            return (Number(amt) !== 0) ? <span className="attr-amt">{Number(amt) >= 0 ? ` +\u00A0Rs\u00A0${Number(amt).toFixed(2)}` : ` -\u00A0Rs\u00A0${Math.abs(Number(amt)).toFixed(2)}`}</span> : null;
                                          })()}
                                        </span>
                                      ))}
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
                    </div>
                    <div className="order-item-qty">x{item.quantity}</div>
                    <div className="order-item-price">
                      Rs {((Number(item.price || 0) + Number(item.attributesTotal || 0)) * Number(item.quantity || 1)).toFixed(2)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

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
              <span>Platform Fee</span>
              <span>Rs {platformFee.toFixed(2)}</span>
            </div>
            <div className="total-row">
              <span>Sales Tax</span>
              <span>Rs {salesTax.toFixed(2)}</span>
            </div>
            {discount > 0 && (
              <div className="total-row discount">
                <span>{`Promo code - ${appliedVoucher?.code || ''}`}</span>
                <span className="discount-amount">-Rs {discount.toFixed(2)}</span>
              </div>
            )}
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
            <label
              className={`payment-option ${
                paymentMethod === "cash" ? "active" : ""
              }`}
            >
              <input
                type="radio"
                name="payment"
                value="cash"
                checked={paymentMethod === "cash"}
                onChange={(e) => setPaymentMethod(e.target.value)}
              />
              <div className="payment-icon">💵</div>
              <span>Cash</span>
            </label>

            <label
              className={`payment-option ${
                paymentMethod === "card" ? "active" : ""
              }`}
            >
              <input
                type="radio"
                name="payment"
                value="card"
                checked={paymentMethod === "card"}
                onChange={(e) => setPaymentMethod(e.target.value)}
              />
              <div className="payment-icon">
                <FiCreditCard size={24} />
              </div>
              <span>Credit Card</span>
            </label>

            <label
              className={`payment-option ${
                paymentMethod === "debit" ? "active" : ""
              }`}
            >
              <input
                type="radio"
                name="payment"
                value="debit"
                checked={paymentMethod === "debit"}
                onChange={(e) => setPaymentMethod(e.target.value)}
              />
              <div className="payment-icon">💳</div>
              <span>Debit Card</span>
            </label>

            <label
              className={`payment-option ${
                paymentMethod === "paypal" ? "active" : ""
              }`}
            >
              <input
                type="radio"
                name="payment"
                value="paypal"
                checked={paymentMethod === "paypal"}
                onChange={(e) => setPaymentMethod(e.target.value)}
              />
              <div className="payment-icon">🅿️</div>
              <span>PayPal</span>
            </label>

            <label
              className={`payment-option ${
                paymentMethod === "gpay" ? "active" : ""
              }`}
            >
              <input
                type="radio"
                name="payment"
                value="gpay"
                checked={paymentMethod === "gpay"}
                onChange={(e) => setPaymentMethod(e.target.value)}
              />
              <div className="payment-icon">🔵</div>
              <span>Google Pay</span>
            </label>

            <label
              className={`payment-option ${
                paymentMethod === "applepay" ? "active" : ""
              }`}
            >
              <input
                type="radio"
                name="payment"
                value="applepay"
                checked={paymentMethod === "applepay"}
                onChange={(e) => setPaymentMethod(e.target.value)}
              />
              <div className="payment-icon">🍎</div>
              <span>Apple Pay</span>
            </label>
          </div>
        </div>

        {/* Card picker shown when card/debit selected */}
        {(paymentMethod === 'card' || paymentMethod === 'debit') && (
          <div className="section" ref={cardPickerRef}>
            <div className="section-header">
              <h2>Select Card</h2>
              <button className="btn-text" onClick={() => navigate('/account/payment')}>
                <FiPlus size={14} /> Add New
              </button>
            </div>

            {paymentMethodsList.length === 0 ? (
              <div className="no-address-card">
                <p>No saved cards. Add one to pay by card.</p>
              </div>
            ) : (
              <div className="address-card">
                <div className="address-icon">
                  <FiCreditCard size={24} color="#FF6B35" />
                </div>
                <div className="address-info">
                  <div className="address-type">Saved Cards</div>
                  <div className="address-text">Select which card to use for payment</div>
                </div>
                <div className="address-actions">
                  {paymentMethodsList.map((pm) => (
                    <button
                      key={pm._id || pm.id}
                      className={`btn btn-sm ${String(selectedCardId) === String(pm._id || pm.id) ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setSelectedCardId(pm._id || pm.id)}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                        <span style={{ fontWeight: 700 }}>{(pm.cardType || pm.type || 'Card').toUpperCase()} •••• {(pm.last4 || pm.cardNumber || '').slice(-4)}</span>
                        {pm.isPrimary && <small style={{ color: 'var(--success-color, #10b981)' }}>Primary</small>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Phone Verification Warning */}
        {requiresPhoneVerification && (
          <div className="verification-warning">
            <FiAlertCircle size={20} />
            <div className="warning-content">
              <p className="warning-title">Phone verification required</p>
              <p className="warning-text">
                Please verify your phone number to place an order.
              </p>
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
            {orderError.includes("not found") && (
              <button
                className="clear-cart-link"
                onClick={() => {
                  clearCart();
                  navigate("/store");
                }}
              >
                Clear Cart & Browse Menu
              </button>
            )}
          </div>
        )}
        <button
          className={`btn btn-primary place-order-btn ${
            requiresPhoneVerification ? "requires-verification" : ""
          }`}
          onClick={handlePlaceOrder}
          disabled={isPlacingOrder}
        >
          {isPlacingOrder
            ? "Placing Order..."
            : requiresPhoneVerification
            ? "Verify Phone to Order"
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

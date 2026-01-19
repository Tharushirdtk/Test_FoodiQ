import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiChevronDown, FiChevronUp } from 'react-icons/fi';
import orderService from '../services/orderService';
import paymentService from '../services/paymentService';
import QuickNavSidebar from '../components/QuickNavSidebar';
import '../styles/SubPage.css';

const OrdersPage = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('all');

  const { role } = useAuth();
  const { user } = useAuth();

  useEffect(() => {
    const load = async () => {
      if (role === 'driver') {
        try {
          setLoading(true);
          const data = await orderService.getAssignedOrders();
          setOrders(data || []);
        } catch (err) { setError('Failed to load orders'); } finally { setLoading(false); }
      } else {
        loadOrders();
      }
    };
    load();
  }, [role]);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const data = await orderService.getOrders();
      setOrders(data || []);
    } catch (err) {
      setError('Failed to load orders');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filteredOrders = orders.filter(order => {
    if (activeTab === 'all') return true;
    if (activeTab === 'active') return ['order_placed','order_confirmed','preparing_your_meal','ready_for_pickup','driver_assigned','out_for_delivery','order_picked_up'].includes(order.status);
    if (activeTab === 'completed') return ['delivered', 'picked_up_my_order', 'completed'].includes(order.status);
    if (activeTab === 'cancelled') return order.status === 'cancelled';
    return true;
  });

  const getStatusBadge = (status) => {
    const statusMap = {
      order_placed: { label: 'Pending', class: 'pending' },
      order_confirmed: { label: 'Confirmed', class: 'pending' },
      preparing_your_meal: { label: 'Preparing', class: 'pending' },
      ready_for_pickup: { label: 'Ready', class: 'pending' },
      driver_assigned: { label: 'Driver assigned', class: 'pending' },
      out_for_delivery: { label: 'On the way', class: 'pending' },
      order_picked_up: { label: 'Picked up', class: 'pending' },
      delivered: { label: 'Delivered', class: 'completed' },
      picked_up_my_order: { label: 'Picked up', class: 'completed' },
      cancelled: { label: 'Cancelled', class: 'cancelled' }
    };
    return statusMap[status] || { label: status, class: 'pending' };
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatAmount = (value) => {
    const n = Number(value || 0);
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Deprecated: frontend should not compute totals. Backend is authoritative.

  // Display price should be final amount (after delivery fees, taxes, promos).
  const getDisplayPrice = (order) => {
    if (!order) return 0;
    // Backend is authoritative: prefer `order.total`. If missing, show 0 rather than computing.
    return order.total != null ? Number(order.total) || 0 : 0;
  };

  const formatPaymentMethodLabel = (method) => {
    if (!method) return '—';
    const m = String(method).toLowerCase();
    const map = {
      cash: 'Cash',
      card: 'Credit Card',
      debit: 'Debit Card',
      paypal: 'PayPal',
      gpay: 'Google Pay',
      applepay: 'Apple Pay'
    };
    return map[m] || (m.charAt(0).toUpperCase() + m.slice(1));
  };

  const [expanded, setExpanded] = useState({});
  const [orderDetails, setOrderDetails] = useState({});

  const toggleExpand = async (e, orderId) => {
    e.stopPropagation();
    const isExpanded = !!expanded[orderId];
    if (isExpanded) {
      setExpanded(prev => ({ ...prev, [orderId]: false }));
      return;
    }

    // expand: fetch detailed order if not already fetched
    if (!orderDetails[orderId]) {
      try {
        const data = await orderService.getOrder(orderId);
        // if server populated payment.cardId as a document, use it
        if (data && data.payment && data.payment.cardId && typeof data.payment.cardId === 'object') {
          data._selectedCard = data.payment.cardId;
        } else if (data && data.payment && data.payment.cardId) {
          // try to fetch saved cards and attach matching card as fallback
          try {
            const methods = await paymentService.getPaymentMethods();
            const card = (methods || []).find(m => String(m._id) === String(data.payment.cardId));
            if (card) data._selectedCard = card;
          } catch (err) {
            console.warn('Failed to load payment methods', err);
          }
        }
        setOrderDetails(prev => ({ ...prev, [orderId]: data }));
      } catch (err) {
        console.error('Failed to load order details', err);
      }
    }

    setExpanded(prev => ({ ...prev, [orderId]: true }));
  };

  return (
    <div className="sub-page">
      <header className="sub-header">
        <button className="back-btn" onClick={() => navigate('/account')}>
          <FiArrowLeft size={24} />
        </button>
        <h1>My Orders</h1>
      </header>

      <div className="sub-content">
        {/* Tabs */}
        <div className="tabs">
          <button 
            className={`tab ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            All
          </button>
          <button 
            className={`tab ${activeTab === 'active' ? 'active' : ''}`}
            onClick={() => setActiveTab('active')}
          >
            Active
          </button>
          <button 
            className={`tab ${activeTab === 'completed' ? 'active' : ''}`}
            onClick={() => setActiveTab('completed')}
          >
            Completed
          </button>
          <button 
            className={`tab ${activeTab === 'cancelled' ? 'active' : ''}`}
            onClick={() => setActiveTab('cancelled')}
          >
            Cancelled
          </button>
        </div>

        {role === 'driver' && user && !user.phoneVerified ? (
          <>
            <div className="error-message">You must verify your primary contact number to access driver orders. Please verify your phone number in your account settings.</div>
            <div style={{ marginTop: 12 }}>
              <button className="btn" onClick={() => navigate('/account', { state: { openSection: 'contact' } })}>Verify Phone</button>
            </div>
          </>
        ) : loading ? (
          <div className="loading-spinner-container">
            <div className="loading-spinner"></div>
          </div>
        ) : error ? (
          <div className="error-message">{error}</div>
        ) : filteredOrders.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📦</div>
            <h3>No orders yet</h3>
            <p>When you place orders, they'll appear here</p>
            <button className="btn" onClick={() => navigate('/store')}>
              Browse Menu
            </button>
          </div>
        ) : (
          <div className="card-list">
            {filteredOrders.map(order => {
              const status = getStatusBadge(order.status);
              return (
                <div 
                  key={order._id} 
                  className="card-item"
                  onClick={() => navigate(`/order/${order._id}`)}
                >
                  <div className="card-header">
                    <h3 className="card-title">Order #{order._id?.slice(-6).toUpperCase()}</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className={`card-badge ${status.class}`}>{status.label}</span>
                      {/* service type tag */}
                      {order.serviceType && (
                        <span className={`card-type ${order.serviceType === 'pickup' ? 'pickup' : 'delivery'}`} style={{ fontSize: 12, padding: '4px 8px', borderRadius: 12, background: order.serviceType === 'pickup' ? '#f0f4ff' : '#fff7e6', color: order.serviceType === 'pickup' ? '#003366' : '#6a4b00' }}>{order.serviceType === 'pickup' ? 'Pickup' : 'Delivery'}</span>
                      )}
                      <button className="btn btn-icon" onClick={(e) => toggleExpand(e, order._id)} aria-label="expand-order">
                        {expanded[order._id] ? <FiChevronUp size={18} /> : <FiChevronDown size={18} />}
                      </button>
                    </div>
                  </div>
                  <div className="card-body">
                    <p>{order.items?.length || 0} items</p>
                    {order.items?.slice(0, 2).map((item, idx) => (
                      <p key={idx} style={{ fontSize: 13, color: 'var(--text-light)' }}>
                        • {item.name} x{item.quantity}
                      </p>
                    ))}
                    {order.items?.length > 2 && (
                      <p style={{ fontSize: 13, color: 'var(--text-light)' }}>
                        +{order.items.length - 2} more items
                      </p>
                    )}
                    {/* Expanded details */}
                    {expanded[order._id] && (
                      <div className="order-expanded" style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-color)' }} onClick={(e) => e.stopPropagation()}>
                        {/* show fetched details if available, otherwise show order (partial) */}
                        {orderDetails[order._id] ? (
                          <>
                            <div style={{ marginBottom: 8 }}>
                              <strong>Vendors:</strong>
                                <div style={{ marginTop: 6 }}>
                                  {/* Prefer vendorAddresses if present, otherwise derive vendors from items */}
                                  {((orderDetails[order._id].vendorAddresses && orderDetails[order._id].vendorAddresses.length > 0)
                                    ? orderDetails[order._id].vendorAddresses.map((va, i) => ({ id: va.vendor?._id || va._id || i, name: va.vendor ? (va.vendor.vendorProfile?.storeName || va.vendor.displayName || va.vendor.name) : (va.label || va.addressLabel || 'Vendor'), street: va.address?.street || va.street || '' }))
                                    : (orderDetails[order._id].items || []).map(it => it.vendor).filter(Boolean).reduce((acc, v) => { if (!acc.find(x => String(x.id) === String(v._id || v.id))) acc.push({ id: v._id || v.id, name: (v.vendorProfile && v.vendorProfile.storeName) || v.displayName || v.name || 'Vendor', street: '' }); return acc; }, [])
                                ).map((v, idx) => (
                                  <div key={v.id || idx} style={{ fontSize: 13, color: 'var(--text-light)' }}>
                                    - {v.name}{v.street ? ` — ${v.street}` : ''}
                                  </div>
                                ))}
                                </div>
                            </div>

                            <div style={{ marginBottom: 8 }}>
                              <strong>Items:</strong>
                              <div style={{ marginTop: 6 }}>
                                {orderDetails[order._id].items.map((it, ii) => (
                                  <div key={ii} style={{ fontSize: 13, color: 'var(--text-light)', marginBottom: 6 }}>
                                    <div>• {it.name} x{it.quantity}</div>
                                    {it.options && Object.keys(it.options).length > 0 && (
                                        <div style={{ marginLeft: 12, color: 'var(--text-gray)', fontSize: 13 }}>
                                          {it.options.size && <div>Size: {it.options.size}</div>}
                                          {it.options.spiceLevel && <div>Spice: {it.options.spiceLevel}</div>}
                                          {Array.isArray(it.options.extras) && it.options.extras.length > 0 && (
                                            <div>Extras: {it.options.extras.map(e => (typeof e === 'string' ? e : (e.name || e.label || e.value || JSON.stringify(e)))).join(', ')}</div>
                                          )}
                                          {it.options.instructions && <div>Notes: {it.options.instructions}</div>}
                                        </div>
                                    )}
                                    {/* Vendor label for this item */}
                                    {it.vendor ? (
                                      <div style={{ marginLeft: 6, fontSize: 12, color: 'var(--text-light)' }}>
                                        From: {it.vendor.vendorProfile?.storeName || it.vendor.displayName || it.vendor.name || it.vendor}
                                      </div>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Totals */}
                            <div style={{ marginBottom: 8 }}>
                              <strong>Totals:</strong>
                              <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-light)' }}>
                                  <div>Subtotal: Rs {formatAmount(orderDetails[order._id].subtotal)}</div>
                                  <div>Delivery fee: Rs {formatAmount(orderDetails[order._id].deliveryFee)}</div>
                                  { (orderDetails[order._id].salesTax || orderDetails[order._id].tax) ? (
                                    <div>Sales Tax: Rs {formatAmount(orderDetails[order._id].salesTax || orderDetails[order._id].tax)}</div>
                                  ) : null }
                                  { (typeof orderDetails[order._id].platformFee !== 'undefined' && orderDetails[order._id].platformFee !== null) ? (
                                    <div>Platform fee: Rs {formatAmount(orderDetails[order._id].platformFee)}</div>
                                  ) : null }
                                  { (orderDetails[order._id].promoAmount || orderDetails[order._id].discountAmount || orderDetails[order._id].discount) ? (
                                    <div className="summary-row discount">{`Promo${orderDetails[order._id].promoCode ? ' - ' + orderDetails[order._id].promoCode : ''}`}</div>
                                  ) : null }
                                  { (orderDetails[order._id].promoAmount || orderDetails[order._id].discountAmount || orderDetails[order._id].discount) ? (
                                    <div style={{ color: 'var(--danger)', marginTop: 4 }}>- Rs {formatAmount(orderDetails[order._id].promoAmount || orderDetails[order._id].discountAmount || orderDetails[order._id].discount)}</div>
                                  ) : null }
                                  <div style={{ fontWeight: 700 }}>Total: Rs {formatAmount(orderDetails[order._id].total)}</div>
                                </div>
                            </div>

                            { !(orderDetails[order._id].serviceType === 'pickup') && (
                              <div style={{ marginBottom: 8 }}>
                                <strong>Driver:</strong>
                                <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-light)' }}>
                                  {orderDetails[order._id].driver ? `${orderDetails[order._id].driver.name || orderDetails[order._id].driver.displayName} (${orderDetails[order._id].driver.phone || ''})` : 'Not assigned'}
                                </div>
                              </div>
                            )}

                            <div style={{ marginBottom: 8 }}>
                              <strong>Payment:</strong>
                              <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-light)' }}>
                                Method: {formatPaymentMethodLabel(orderDetails[order._id].payment?.method || order.payment?.method)}
                                {orderDetails[order._id]._selectedCard && (
                                  <div>Card: {orderDetails[order._id]._selectedCard.brand || orderDetails[order._id]._selectedCard.cardType} •••• {orderDetails[order._id]._selectedCard.last4 || (orderDetails[order._id]._selectedCard.cardNumber || '').slice(-4)}</div>
                                )}
                              </div>
                            </div>

                            {orderDetails[order._id].deliveryNote && (
                              <div style={{ marginBottom: 8 }}>
                                <strong>Delivery note:</strong>
                                <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-light)' }}>{orderDetails[order._id].deliveryNote}</div>
                              </div>
                            )}

                            {/* promo code hidden per request */}
                          </>
                        ) : (
                          <div style={{ fontSize: 13, color: 'var(--text-gray)' }}>Loading details…</div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="card-footer">
                    <span className="card-price">Rs. {formatAmount(getDisplayPrice(order))}</span>
                    <span className="card-date">{formatDate(order.createdAt)}</span>
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

export default OrdersPage;

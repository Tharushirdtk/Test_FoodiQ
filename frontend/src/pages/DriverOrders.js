import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import orderService from '../services/orderService';
import profileService from '../services/profileService';
import '../styles/DriverOrders.css';
import '../styles/SubPage.css';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import NotificationsButton from '../components/NotificationsButton';

const DriverOrders = () => {
  const navigate = useNavigate();
  const { role } = useAuth();
  const { user } = useAuth();
  const { on } = useSocket();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [phoneVerified, setPhoneVerified] = useState(user?.phoneVerified || false);

  

  useEffect(() => {
    let mounted = true;
    const refreshProfile = async () => {
      try {
        const res = await profileService.getProfile();
        if (!mounted) return;
        // support different response shapes
        const prof = res;
        let verified = false;
        if (prof) {
          if ('phoneVerified' in prof) verified = Boolean(prof.phoneVerified);
          else if (prof.user && 'phoneVerified' in prof.user) verified = Boolean(prof.user.phoneVerified);
          else if (prof.data && prof.data.user && 'phoneVerified' in prof.data.user) verified = Boolean(prof.data.user.phoneVerified);
        }
        setPhoneVerified(verified);
      } catch (e) {}
    };
    // initialize from context and server
    setPhoneVerified(Boolean(user?.phoneVerified));
    refreshProfile();

    const onFocus = () => { refreshProfile(); };
    window.addEventListener('focus', onFocus);
    return () => { mounted = false; window.removeEventListener('focus', onFocus); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?._id]);

  useEffect(() => {
    // Ensure profile is fresh before attempting to load driver orders when driver role
    let mounted = true;
    const init = async () => {
      try {
          const prof = await profileService.getProfile();
          
          if (!mounted) return;
          // robust extraction
          let isVerified = false;
          if (prof) {
            if ('phoneVerified' in prof) isVerified = Boolean(prof.phoneVerified);
            else if (prof.user && 'phoneVerified' in prof.user) isVerified = Boolean(prof.user.phoneVerified);
            else if (prof.data && prof.data.user && 'phoneVerified' in prof.data.user) isVerified = Boolean(prof.data.user.phoneVerified);
          }
          setPhoneVerified(isVerified);
          if (role === 'driver' && !isVerified) {
            setLoading(false);
            return;
          }
        // otherwise proceed to load orders (existing logic in next effect handles it)
      } catch (e) {
        // ignore
      }
    };
    init();
    return () => { mounted = false; };
  }, [role]);

  useEffect(() => {
    let mounted = true;

    const loadDriverOrders = async () => {
      try {
        setLoading(true);
        // fetch available unassigned ready_for_pickup orders (exclude pickup-mode orders)
        let data = await orderService.getAvailableOrders();
        if (Array.isArray(data)) data = data.filter(o => (o && o.serviceType) ? String(o.serviceType) !== 'pickup' : true);
        // If this driver already has an active assigned order elsewhere, check and redirect
        try {
          const assigned = await orderService.getAssignedOrders({ fallback: false });
          if (Array.isArray(assigned) && assigned.length > 0) {
            const myAssigned = assigned.find(o => o && o.driver && ['driver_assigned', 'out_for_delivery'].includes((o.status || '').toString())) || null;
            if (myAssigned) { navigate(`/order/${myAssigned._id}`); return; }
          }
        } catch (e) { /* ignore */ }

        if (mounted) setOrders(data || []);
      } catch (err) {
        console.error(err);
        if (mounted) setError('Failed to load orders');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    const loadAllOrdersForSupport = async () => {
      try {
        if (mounted) setLoading(true);
        const data = await orderService.getOrders();
        if (mounted) setOrders(data || []);
      } catch (err) {
        console.error(err);
        if (mounted) setError('Failed to load orders');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    if (role === 'driver') {
      loadDriverOrders();
    } else if (role === 'support' || role === 'admin') {
      // Support and admin should see the full driver orders list (all orders regardless of status)
      loadAllOrdersForSupport();
    }
  }, [role, navigate]);

  // Listen for realtime assignment events and remove assigned orders from the list
  useEffect(() => {
    if (!on) return;
    const off = on('orderAssigned', (payload) => {
      try {
        if (!payload || !payload.orderId) return;
        setOrders(prev => prev.filter(o => String(o._id) !== String(payload.orderId)));
        // If assigned to this user, navigate to tracking view
        const assignedToUserId = payload.assignedToUserId;
        if (assignedToUserId && user && String(assignedToUserId) === String(user._id)) {
          navigate(`/order/${payload.orderId}`);
        } else if (payload.assignedTo && payload.assignedTo._id && user && String(payload.assignedTo._id) === String(user._id)) {
          navigate(`/order/${payload.orderId}`);
        }
      } catch (e) {}
    });
    return () => { off && off(); };
  }, [on, user, navigate]);

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
      cancelled: { label: 'Cancelled', class: 'cancelled' }
    };
    return statusMap[status] || { label: status, class: 'pending' };
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleString([], { month: 'numeric', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const getOrderTotal = (order) => {
    if (!order || !Array.isArray(order.items)) return 0;
    return order.items.reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.quantity) || 1), 0);
  };

  // If driver and primary contact not verified, show verification message only
  if (role === 'driver' && user && !phoneVerified) {
    return (
      <div className="sub-page driver-orders-page">
        <header className="account-header">
          <button className="btn btn-icon logo-btn" onClick={() => navigate('/')}>
            <img src="/images/logo.png" alt="FoodIQ" className="header-logo-small" />
          </button>
          <h1>Orders</h1>
        </header>
        <div className="sub-content">
          <div className="verification-warning">
            <div className="warning-content">
              <p className="warning-title">Phone verification required</p>
              <p className="warning-text">You must verify your primary contact number to access driver orders. Please verify your phone number in your account settings.</p>
            </div>
            <div>
              <button className="btn btn-small verify-now-btn" onClick={() => navigate('/account', { state: { openSection: 'contact' } })}>Verify Phone</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sub-page driver-orders-page">
      <header className={`account-header ${role === 'driver' ? 'center-logo' : ''}`}>
        <button className="btn btn-icon logo-btn" onClick={() => navigate('/')}>
          <img src="/images/logo.png" alt="FoodIQ" className="header-logo-small" />
        </button>
        <h1>{role === 'admin' ? 'Driver Orders' : 'Orders'}</h1>
        <div className="header-actions" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <NotificationsButton />
        </div>
      </header>

      <div className="sub-content" style={(!loading && !error && orders.length === 0) ? { minHeight: 'calc(100vh - var(--header-height,64px) - var(--bottom-nav-height,64px))', display: 'flex', alignItems: 'center', justifyContent: 'center' } : undefined}>
        {loading ? (
          <div className="loading-spinner-container">
            <div className="loading-spinner"></div>
          </div>
        ) : error ? (
          <div className="error-message">{error}</div>
        ) : orders.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📦</div>
            <h3>No ready orders</h3>
            <p>Orders ready for pickup will appear here when available.</p>
          </div>
        ) : (
          <div className="driver-card-list">
            {orders.map(order => {
              const status = getStatusBadge(order.status);
              return (
                <div
                  key={order._id}
                  className="driver-card"
                  onClick={() => {
                    if (role === 'support' || role === 'admin') {
                      // Support users should view the standard OrderTracking page
                      navigate(`/order/${order._id}`);
                    } else {
                      navigate(`/driver/order/${order._id}`);
                    }
                  }}
                >
                  <div className="driver-left">
                    <div className="driver-id">#{order._id?.slice(-6).toUpperCase()}</div>
                    <div className="driver-items">{order.items?.length || 0} items</div>
                    <div className={`driver-status ${status.class}`}>{status.label}</div>
                  </div>
                  <div className="driver-middle">
                    {/* Show vendor stops and customer stop on wide screens only */}
                    {(() => {
                      const vendors = Array.isArray(order.vendorAddresses) && order.vendorAddresses.length > 0
                        ? order.vendorAddresses
                        : (order.vendorAddress ? [order.vendorAddress] : []);
                      const parts = [];
                      // vendors numbered 1..N
                      for (let i = 0; i < vendors.length; i++) parts.push({ type: 'vendor', label: String(i + 1) });
                      // always append customer at end
                      parts.push({ type: 'customer', label: 'C' });

                      return (
                        <div className="stops-line" aria-hidden>
                          <div className="stops-items">
                            {parts.map((p, idx) => (
                              <React.Fragment key={idx}>
                                <div className={`stop-item ${p.type}`}>
                                  <div className={`stop-dot ${p.type === 'vendor' ? 'vendor' : 'customer'} ${p.type === 'vendor' && idx === 0 ? 'active' : ''}`}>
                                    {p.type === 'vendor' ? p.label : 'C'}
                                  </div>
                                  <div className="stop-label">{p.type === 'vendor' ? '' : ''}</div>
                                </div>
                                {idx < parts.length - 1 && <div className="connector" aria-hidden />}
                              </React.Fragment>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  <div className="driver-right">
                    <div className="driver-total">Rs. {getOrderTotal(order).toLocaleString()}</div>
                    <div className="driver-date">{formatDate(order.createdAt)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default DriverOrders;

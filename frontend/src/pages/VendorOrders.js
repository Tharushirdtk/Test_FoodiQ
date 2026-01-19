import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import NotificationsButton from '../components/NotificationsButton';
import profileService from '../services/profileService';
import { useAuth } from '../context/AuthContext';
import api from '../utils/apiClient';
import LoadingSpinner from '../components/LoadingSpinner';
import '../styles/DriverOrders.css';
import '../styles/SubPage.css';

export default function VendorOrders() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const API = process.env.REACT_APP_API_URL || 'http://localhost:5000';
  const [phoneVerified, setPhoneVerified] = useState(user?.phoneVerified || false);

  // helper to extract phoneVerified from returned profile shape
  const extractPhoneVerified = (prof) => {
    if (!prof) return false;
    if (typeof prof === 'object') {
      if ('phoneVerified' in prof) return Boolean(prof.phoneVerified);
      if (prof.user && 'phoneVerified' in prof.user) return Boolean(prof.user.phoneVerified);
      if (prof.data && prof.data.user && 'phoneVerified' in prof.data.user) return Boolean(prof.data.user.phoneVerified);
      if (prof.data && 'phoneVerified' in prof.data) return Boolean(prof.data.phoneVerified);
    }
    return false;
  };

  // load vendor orders helper (can be called after profile refresh)
  const loadVendorOrders = useCallback(async (mountedFlag = { v: true }) => {
    try {
      const res = await api.get(`/vendors/${user._id}/orders`);
      const list = res.orders || res.data?.orders || [];
      const filtered = list.filter(o => {
        if (!o) return false;
        const status = (o.status || '').toString();
        // accept canonical vendor-relevant statuses
        if (!['order_confirmed', 'preparing_your_meal', 'ready_for_pickup'].includes(status)) return false;
        if (!Array.isArray(o.items)) return false;
        return o.items.some(i => String(i.vendor) === String(user._id));
      });
      if (mountedFlag.v) setOrders(filtered);
    } catch (e) {
      console.error('[VendorOrders] loadVendorOrders failed', e);
      if (mountedFlag.v) setOrders([]);
    } finally {
      if (mountedFlag.v) setLoading(false);
    }
  }, [user?._id]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        
        // (extractPhoneVerified defined above)

        // ensure we have the latest profile first so verification UI is accurate
        try {
          const prof = await profileService.getProfile();
          if (mounted) setPhoneVerified(extractPhoneVerified(prof));
        } catch (e) {
          
        }

        // If vendor and not verified, check profile then possibly skip
        if (role === 'vendor') {
          let currentVerified = false;
          try {
            const prof2 = await profileService.getProfile();
            currentVerified = extractPhoneVerified(prof2);
            if (mounted) setPhoneVerified(currentVerified);
          } catch (e) {
            // ignore
          }
          if (!currentVerified) {
            if (mounted) setLoading(false);
            return;
          }
        }

        // Verified or non-vendor: load orders
        await loadVendorOrders({ v: mounted });
      } catch (e) {
        console.error('Failed to load vendor orders', e);
      } finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, [user._id, loadVendorOrders, role]);

  useEffect(() => {
    let mounted = true;
    const refreshProfile = async () => {
      try {
        const res = await profileService.getProfile();
        if (!mounted) return;
        const verified = extractPhoneVerified(res);
        setPhoneVerified(verified);
        // If vendor just became verified, reload orders
        if (role === 'vendor' && verified) {
          await loadVendorOrders({ v: mounted });
        }
      } catch (e) {
        
      }
    };
    setPhoneVerified(Boolean(user?.phoneVerified));
    refreshProfile();

    const onFocus = () => { refreshProfile(); };
    window.addEventListener('focus', onFocus);
    return () => { mounted = false; window.removeEventListener('focus', onFocus); };
  }, [user?._id, user?.phoneVerified, loadVendorOrders, role]);

  // don't short-circuit render the entire page during loading — keep header visible

  // If vendor and primary contact not verified, show verification message only
  if (role === 'vendor' && user && !phoneVerified) {
    return (
      <div className="sub-page vendor-orders-page">
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
              <p className="warning-text">You must verify your primary contact number to access vendor orders. Please verify your phone number in your account settings.</p>
            </div>
            <div>
              <button className="btn btn-small verify-now-btn" onClick={() => navigate('/account', { state: { openSection: 'contact' } })}>Verify Phone</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const formatDate = (d) => {
    if (!d) return '';
    const date = new Date(d);
    return date.toLocaleString([], { month: 'numeric', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const vendorItemsCount = (order) => {
    if (!order || !Array.isArray(order.items)) return 0;
    return order.items.filter(i => String(i.vendor) === String(user._id)).length;
  };

  const vendorTotal = (order) => {
    if (!order || !Array.isArray(order.items)) return 0;
    return order.items.filter(i => String(i.vendor) === String(user._id)).reduce((s, it) => {
      if (typeof it.vendorRevenue === 'number') return s + it.vendorRevenue;
      const price = Number(it.price) || 0;
      const qty = Number(it.quantity) || 1;
      return s + price * qty;
    }, 0);
  };

  const getVendorStatus = (order) => {
    if (!order) return { label: '', cls: '' };
    // If any vendor item is ready -> Ready
    if (Array.isArray(order.items) && order.items.some(i => i && i.vendor && String(i.vendor) === String(user._id) && i.ready)) {
      return { label: 'Ready', cls: 'ready' };
    }
    // If any vendor item is preparing -> Preparing
    if (Array.isArray(order.items) && order.items.some(i => i && i.vendor && String(i.vendor) === String(user._id) && i.preparing)) {
      return { label: 'Preparing', cls: 'preparing' };
    }
    // If vendor address was visited for this vendor -> Completed
    if (Array.isArray(order.vendorAddresses) && order.vendorAddresses.some(va => String(va.vendor) === String(user._id) && va.visited)) {
      return { label: 'Completed', cls: 'completed' };
    }
    // Map overall order.status to vendor-relevant label
    const s = (order.status || '').toString();
    if (s === 'order_confirmed') return { label: 'Confirmed', cls: 'pending' };
    if (s === 'preparing_your_meal') return { label: 'Preparing', cls: 'preparing' };
    if (s === 'ready_for_pickup') return { label: 'Ready', cls: 'ready' };
    // fallback: show capitalized short status
    return { label: s ? s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '', cls: 'pending' };
  };

  return (
    <div className="sub-page driver-orders-page">
      <header className={`account-header ${role === 'driver' || role === 'support' ? 'center-logo' : ''}`}>
        <button className="btn btn-icon logo-btn" onClick={() => navigate('/')}>
          <img src="/images/logo.png" alt="FoodIQ" className="header-logo-small" />
        </button>
        <h1>{role === 'admin' ? 'Vendor Orders' : 'Orders'}</h1>
        <div className="header-actions" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <NotificationsButton />
        </div>
      </header>

      <div className="sub-content" style={orders.length === 0 ? { minHeight: 'calc(100vh - var(--header-height,64px) - var(--bottom-nav-height,64px))', display: 'flex', alignItems: 'center', justifyContent: 'center' } : undefined}>
        {loading ? (
          <div className="loading-spinner-container">
            <LoadingSpinner />
          </div>
        ) : orders.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📦</div>
            <h3>No orders for your products yet.</h3>
          </div>
        ) : (
          <div className="driver-card-list">
            {orders.map(order => (
              <div key={order._id} className="driver-card" onClick={() => navigate(`/order/${order._id}`)}>
                <div className="driver-left">
                  <div className="driver-id">#{String(order._id).slice(-6).toUpperCase()}</div>
                  <div className="driver-items">{vendorItemsCount(order)} items for you</div>
                    {
                      (() => {
                        const s = getVendorStatus(order);
                        return <div className={`driver-status ${s.cls || 'pending'}`}>{s.label || 'Confirmed'}</div>;
                      })()
                    }
                </div>
                <div className="driver-middle">
                  {/* vendor stops and customer stop simplified for vendor view */}
                  <div className="stops-line" aria-hidden>
                    <div className="stops-items">
                      <div className="stop-item vendor">
                        <div className="stop-dot vendor active">1</div>
                      </div>
                      <div className="connector" />
                      <div className="stop-item customer">
                        <div className="stop-dot customer">C</div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="driver-right">
                  <div className="driver-total">Rs. {vendorTotal(order).toLocaleString()}</div>
                  <div className="driver-date">{formatDate(order.createdAt)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { CartProvider, useCart } from './context/CartContext';
import { ThemeProvider } from './context/ThemeContext';
import { useAuth } from './context/AuthContext';
import { useSocket } from './context/SocketContext';
import orderService from './services/orderService';
import { ToastProvider } from './context/ToastContext';
import { NotificationsProvider } from './context/NotificationsContext';
import HomePage from './pages/HomePage';
import StorePage from './pages/StorePage';
import ProductPage from './pages/ProductPage';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import OrderTrackingPage from './pages/OrderTrackingPage';
import AccountPage from './pages/AccountPage';
import LoginPage from './pages/LoginPage';
import RegisterStep1 from './pages/RegisterStep1';
import RegisterStep2 from './pages/RegisterStep2';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
// New pages
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import TermsConditionsPage from './pages/TermsConditionsPage';
import OrdersPage from './pages/OrdersPage';
import DriverOrders from './pages/DriverOrders';
import DriverOrderDetail from './pages/DriverOrderDetail';
import DriverHistory from './pages/DriverHistory';
import WalletPage from './pages/WalletPage';
import AddressesPage from './pages/AddressesPage';
import FavoritesPage from './pages/FavoritesPage';
import PaymentPage from './pages/PaymentPage';
import NotificationsPage from './pages/NotificationsPage';
import SupportPage from './pages/SupportPage';
import SupportDashboard from './pages/SupportDashboard';
import SupportChatPage from './pages/SupportChatPage';
import SupportConversationPage from './pages/SupportConversationPage';
import OrderChatPage from './pages/OrderChatPage';
import AdminDashboard from './pages/AdminDashboard';
import NotFound from './components/NotFound';
import VendorProducts from './pages/VendorProducts';
import './App.css';
import ProtectedRoute from './components/ProtectedRoute';
import VendorWallet from './pages/VendorWallet';
import AccessDenied from './components/AccessDenied';
import VendorHistory from './pages/VendorHistory';
import VendorOrders from './pages/VendorOrders';
import DriverModal from './components/DriverModal';
import VendorModal from './components/VendorModal';

function App() {
  const AuthWrapper = () => {
    const { isAuthenticated, isGuest, loading, role } = useAuth();
    const blockedForStore = ['driver', 'vendor', 'support'];
    
    // Show nothing while loading auth state (prevents flash)
    if (loading) {
      return (
        <div className="auth-loading">
          <div className="loading-spinner"></div>
        </div>
      );
    }
    
    // If not authenticated and not guest, show Login at root
    return (
      <Routes>
        <Route path="/" element={(!isAuthenticated && !isGuest) ? <LoginPage /> : (role === 'driver' ? <DriverLanding /> : (role === 'vendor' ? <Navigate to="/vendor/products" replace /> : (role === 'support' ? <Navigate to="/support" replace /> : <HomePage />)))} />
        <Route path="/store" element={blockedForStore.includes(role) ? <AccessDenied message="Store not accessible for your role." /> : <StorePage />} />
        <Route path="/product/:id" element={<ProtectedRoute requiredRoles={["customer","admin","guest"]}><ProductPage /></ProtectedRoute>} />
        <Route path="/cart" element={blockedForStore.includes(role) ? <AccessDenied message="Cart not accessible for your role." /> : <CartPage />} />
        <Route path="/checkout" element={blockedForStore.includes(role) ? <AccessDenied message="Checkout not accessible for your role." /> : <CheckoutPage />} />
        <Route path="/order/:id" element={<OrderTrackingPage />} />
        <Route path="/order/:id/chat" element={<ProtectedRoute requiredRoles={["customer","driver","vendor","admin"]}><OrderChatPage /></ProtectedRoute>} />
        <Route path="/account" element={<ProtectedRoute requiredRoles={["customer","admin","vendor","driver","support","guest"]}><AccountPage /></ProtectedRoute>} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterStep1 />} />
        <Route path="/register/step1" element={<RegisterStep1 />} />
        <Route path="/register/step2" element={<RegisterStep2 />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        {/* New Routes */}
        <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
        <Route path="/terms" element={<TermsConditionsPage />} />
        <Route path="/orders" element={<ProtectedRoute requiredRoles={["customer","admin","vendor","support"]}><OrdersPage /></ProtectedRoute>} />
        <Route path="/vendor/products" element={<ProtectedRoute requiredRoles={["vendor","admin"]}><VendorProducts /></ProtectedRoute>} />
        <Route path="/driver/orders" element={<ProtectedRoute requiredRoles={["driver","support","admin"]}><DriverOrders /></ProtectedRoute>} />
        <Route path="/driver/order/:id" element={<ProtectedRoute requiredRoles={["driver"]}><DriverOrderDetail /></ProtectedRoute>} />
        <Route path="/driver/history" element={<ProtectedRoute requiredRoles={["driver","admin"]}><DriverHistory /></ProtectedRoute>} />
        <Route path="/wallet" element={<ProtectedRoute requiredRoles={["driver","vendor","admin"]}><WalletPage /></ProtectedRoute>} />
        <Route path="/vendor/wallet" element={<ProtectedRoute requiredRoles={["vendor","admin"]}><VendorWallet /></ProtectedRoute>} />
        <Route path="/vendor/orders" element={<ProtectedRoute requiredRoles={["vendor","admin"]}><VendorOrders /></ProtectedRoute>} />
        <Route path="/vendor/history" element={<ProtectedRoute requiredRoles={["vendor","admin"]}><VendorHistory /></ProtectedRoute>} />
        <Route path="/account/addresses" element={<ProtectedRoute requiredRoles={["customer","admin"]}><AddressesPage /></ProtectedRoute>} />
        <Route path="/account/favorites" element={<ProtectedRoute requiredRoles={["customer","admin"]}><FavoritesPage /></ProtectedRoute>} />
        <Route path="/account/payment" element={<ProtectedRoute requiredRoles={["customer","admin"]}><PaymentPage /></ProtectedRoute>} />
        <Route path="/account/notifications" element={<NotificationsPage />} />
        <Route path="/support/chat" element={<ProtectedRoute requiredRoles={["customer","support","admin"]}><SupportChatPage /></ProtectedRoute>} />
        <Route path="/support/chat/:id" element={<ProtectedRoute requiredRoles={["support","admin"]}><SupportConversationPage /></ProtectedRoute>} />
        <Route path="/support" element={<ProtectedRoute requiredRoles={["customer","support","admin"]}><SupportRouter /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute requiredRoles="admin"><AdminDashboard /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    );
  };

  // Driver landing redirect: on mount, pick assigned order if any and route accordingly
  function DriverLanding() {
    const { role } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      let mounted = true;
      (async () => {
          try {
            if (role !== 'driver') return navigate('/');
            const assigned = await orderService.getAssignedOrders();
            if (!mounted) return;
            // `getAssignedOrders` can return available ready orders when the driver has no active assignment.
            // Ensure we only redirect to an order that is actually assigned to this driver (has a driver field)
            let myAssigned = null;
            if (Array.isArray(assigned) && assigned.length > 0) {
                myAssigned = assigned.find(o => o && o.driver && ['driver_assigned', 'out_for_delivery'].includes((o.status || '').toString())) || null;
            }
            if (myAssigned && myAssigned._id) {
              navigate(`/order/${myAssigned._id}`);
            } else {
              navigate('/driver/orders');
            }
          } catch (e) {
            if (mounted) navigate('/driver/orders');
          } finally {
            if (mounted) setLoading(false);
          }
        })();
      return () => { mounted = false; };
    }, [role, navigate]);

    if (loading) return (
      <div className="auth-loading">
        <div className="loading-spinner"></div>
      </div>
    );
    return null;
  }

  return (
    <ThemeProvider>
      <CartProvider>
        <ToastProvider>
          <NotificationsProvider>
            <Router>
              <div className="App">
                <AuthWrapper />
                <GlobalModals />
                <BottomNav />
              </div>
            </Router>
          </NotificationsProvider>
        </ToastProvider>
      </CartProvider>
    </ThemeProvider>
  );
}

export default App;

// Simple global bottom navigation rendered on most pages
// Simple global bottom navigation rendered on most pages
function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { getCartCount } = useCart();
  const { isAuthenticated, isGuest, role, user, refreshUser } = useAuth();
  const pathname = location.pathname || '/';
  const { supportCounts, on } = useSocket();
  const [assignedOrderId, setAssignedOrderId] = useState(null);

  // don't show on auth flows
  const hidePaths = [
    '/login',
    '/register',
    '/register/step1',
    '/register/step2',
    '/forgot-password',
    '/reset-password',
    '/verify-email'
  ];

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        if (role === 'driver') {
          const assigned = await orderService.getAssignedOrders();
          if (!mounted) return;
          // Determine whether any returned order is actually assigned to this driver
          // Backend returns available ready orders when driver has no active assigned order,
          // so we must check for orders that have a `driver` field and active status.
          let myAssigned = null;
          if (Array.isArray(assigned) && assigned.length > 0) {
            myAssigned = assigned.find(o => o && o.driver && ['driver_assigned', 'out_for_delivery'].includes((o.status || '').toString())) || null;
          }
          if (myAssigned) setAssignedOrderId(myAssigned._id);
          else setAssignedOrderId(null);
        }
      } catch (e) {}
    };
    load();

    const assignedHandler = (payload) => {
      try {
        if (!payload) return;
        // Only set assigned order for this user
        if (payload.assignedToUserId && String(payload.assignedToUserId) === String(user?._id || '')) {
          setAssignedOrderId(payload.orderId);
          // Refresh user profile to pick up driverProfile.assignedOrders/currentAssignedOrder
          try { if (typeof refreshUser === 'function') refreshUser().catch(()=>{}); } catch (e) {}
          // When an order is assigned to this driver, send them to the home
          // page; HomePage's driver redirect will then route them to the
          // assigned order tracking page.
          try { navigate('/'); } catch (e) { /* ignore navigation errors */ }
        } else if (!payload.assignedTo && payload.orderId && assignedOrderId === payload.orderId) {
          // assignment cleared for an order we were tracking
          setAssignedOrderId(null);
        }
      } catch (e) {}
    };

    // Listen for order updates too so we can clear the assigned order when it's completed/cancelled
    const updateHandler = (payload) => {
      try {
        if (!payload || !payload.orderId) return;
        // If this update concerns the order we're tracking, and the order object
        // indicates it's no longer assigned or is in a terminal status, clear it.
        if (assignedOrderId && String(payload.orderId) === String(assignedOrderId)) {
          if (payload.order) {
            const st = (payload.order.status || '').toString();
            if (!['driver_assigned', 'out_for_delivery'].includes(st)) {
              setAssignedOrderId(null);
              return;
            }
          }
          if (payload.action && ['delivered', 'cancel', 'picked_up'].includes(payload.action)) {
            setAssignedOrderId(null);
            return;
          }
        }
      } catch (e) {}
    };

    const offAssigned = on ? on('orderAssigned', assignedHandler) : null;
    const offUpdate = on ? on('orderUpdate', updateHandler) : null;
    return () => { mounted = false; if (offAssigned) offAssigned(); if (offUpdate) offUpdate(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, assignedOrderId]);

  if (hidePaths.some(p => pathname.startsWith(p))) return null;

  // Hide bottom nav on root when the app is showing Login for unauthenticated users
  if (pathname === '/' && !isAuthenticated && !isGuest) return null;

  // Drivers see only Orders & Profile
  if (role === 'driver') {
    return (
      <nav className="bottom-nav">
        {assignedOrderId ? (
          <button className={`nav-item ${pathname.startsWith('/order/') ? 'active' : ''}`} onClick={() => navigate(`/order/${assignedOrderId}`)}>
            <span className="nav-icon">📦</span>
            <span className="nav-label">Order</span>
          </button>
        ) : (
          <button className={`nav-item ${pathname.startsWith('/driver/orders') ? 'active' : ''}`} onClick={() => navigate('/driver/orders')}>
            <span className="nav-icon">📦</span>
            <span className="nav-label">Orders</span>
          </button>
        )}
        <button className={`nav-item ${pathname.startsWith('/account') ? 'active' : ''}`} onClick={() => navigate('/account')}>
          <span className="nav-icon">👤</span>
          <span className="nav-label">Profile</span>
        </button>
      </nav>
    );
  }

  // Vendors see Products, Orders, Profile
  if (role === 'vendor') {
    return (
      <nav className="bottom-nav">
        <button className={`nav-item ${pathname.startsWith('/vendor/products') ? 'active' : ''}`} onClick={() => navigate('/vendor/products')}>
          <span className="nav-icon">🛍️</span>
          <span className="nav-label">Products</span>
        </button>
        <button className={`nav-item ${pathname.startsWith('/vendor/orders') ? 'active' : ''}`} onClick={() => navigate('/vendor/orders')}>
          <span className="nav-icon">📦</span>
          <span className="nav-label">Orders</span>
        </button>
        <button className={`nav-item ${pathname.startsWith('/account') ? 'active' : ''}`} onClick={() => navigate('/account')}>
          <span className="nav-icon">👤</span>
          <span className="nav-label">Profile</span>
        </button>
      </nav>
    );
  }

  // Admins see all navigation options (convenience view)
  if (role === 'admin') {
    return (
      <nav className="bottom-nav">
        <button className={`nav-item ${pathname === '/' ? 'active' : ''}`} onClick={() => navigate('/')}>
          <span className="nav-icon">🏠</span>
          <span className="nav-label">Home</span>
        </button>
        <button className={`nav-item ${pathname.startsWith('/store') ? 'active' : ''}`} onClick={() => navigate('/store')}>
          <span className="nav-icon">🔍</span>
          <span className="nav-label">Search</span>
        </button>
        <button className={`nav-item ${pathname.startsWith('/vendor/products') ? 'active' : ''}`} onClick={() => navigate('/vendor/products')}>
          <span className="nav-icon">🛍️</span>
          <span className="nav-label">V.Products</span>
        </button>
        <button className={`nav-item ${pathname.startsWith('/vendor/orders') ? 'active' : ''}`} onClick={() => navigate('/vendor/orders')}>
          <span className="nav-icon">📦</span>
          <span className="nav-label">V.Orders</span>
        </button>
        <button className={`nav-item ${pathname.startsWith('/driver/orders') ? 'active' : ''}`} onClick={() => navigate('/driver/orders')}>
          <span className="nav-icon">🚚</span>
          <span className="nav-label">D.Orders</span>
        </button>
        <button className={`nav-item ${pathname.startsWith('/cart') ? 'active' : ''}`} onClick={() => navigate('/cart')}>
          <span className="nav-icon">🛍️</span>
          <span className="nav-label">Cart</span>
          {(getCartCount() > 0) && <span className="cart-badge">{getCartCount()}</span>}
        </button>
        <button className={`nav-item ${pathname.startsWith('/support') ? 'active' : ''}`} onClick={() => navigate('/support')}>
          <span className="nav-icon">💬</span>
          <span className="nav-label">Support</span>
        </button>
        <button className={`nav-item ${pathname.startsWith('/admin') ? 'active' : ''}`} onClick={() => navigate('/admin')}>
          <span className="nav-icon">🛠️</span>
          <span className="nav-label">Admin</span>
        </button>
        <button className={`nav-item ${pathname.startsWith('/account') ? 'active' : ''}`} onClick={() => navigate('/account')}>
          <span className="nav-icon">👤</span>
          <span className="nav-label">Profile</span>
        </button>
      </nav>
    );
  }

    // Support users: custom ordering and hide Home
    if (role === 'support') {
      return (
        <nav className="bottom-nav">
          <button className={`nav-item ${pathname.startsWith('/support') ? 'active' : ''}`} onClick={() => navigate('/support')}>
            <span className="nav-icon">💬</span>
            <span className="nav-label">Support</span>
            {(supportCounts?.needSupport > 0) && <span className="support-badge">{supportCounts.needSupport}</span>}
          </button>

          <button className={`nav-item ${pathname.startsWith('/driver/orders') ? 'active' : ''}`} onClick={() => navigate('/driver/orders')}>
            <span className="nav-icon">📦</span>
            <span className="nav-label">Orders</span>
          </button>

          <button className={`nav-item ${pathname.startsWith('/account') ? 'active' : ''}`} onClick={() => navigate('/account')}>
            <span className="nav-icon">👤</span>
            <span className="nav-label">Profile</span>
          </button>
        </nav>
      );
    }

  return (
    <nav className="bottom-nav">
      <button className={`nav-item ${pathname === '/' ? 'active' : ''}`} onClick={() => navigate('/')}>
        <span className="nav-icon">🏠</span>
        <span className="nav-label">Home</span>
      </button>
      <button className={`nav-item ${pathname.startsWith('/store') ? 'active' : ''}`} onClick={() => navigate('/store')}>
        <span className="nav-icon">🔍</span>
        <span className="nav-label">Search</span>
      </button>
      {role !== 'support' && !isGuest && (
        <button className={`nav-item ${pathname.startsWith('/cart') ? 'active' : ''}`} onClick={() => navigate('/cart')}>
          <span className="nav-icon">🛍️</span>
          <span className="nav-label">Cart</span>
          {(getCartCount() > 0) && <span className="cart-badge">{getCartCount()}</span>}
        </button>
      )}
      {(role === 'support' || role === 'admin') && (
        <button className={`nav-item ${pathname.startsWith('/support') ? 'active' : ''}`} onClick={() => navigate('/support')}>
          <span className="nav-icon">💬</span>
          <span className="nav-label">Support</span>
          {(supportCounts?.needSupport > 0) && <span className="support-badge">{supportCounts.needSupport}</span>}
        </button>
      )}
      {role === 'admin' && (
        <button className={`nav-item ${pathname.startsWith('/admin') ? 'active' : ''}`} onClick={() => navigate('/admin')}>
          <span className="nav-icon">🛠️</span>
          <span className="nav-label">Admin</span>
        </button>
      )}
      <button className={`nav-item ${pathname.startsWith('/account') ? 'active' : ''}`} onClick={() => navigate('/account')}>
        <span className="nav-icon">👤</span>
        <span className="nav-label">Profile</span>
      </button>
    </nav>
  );
}

function GlobalModals() {
  const [showDriverModal, setShowDriverModal] = useState(false);
  const [driverModalId, setDriverModalId] = useState(null);
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [vendorModalId, setVendorModalId] = useState(null);

  useEffect(() => {
    const handler = (e) => {
      try {
        const d = e && e.detail;
        if (!d || !d.entity) return;
        if (d.entity === 'driver') {
          setDriverModalId(d.id);
          setShowDriverModal(true);
        } else if (d.entity === 'vendor') {
          setVendorModalId(d.id);
          setShowVendorModal(true);
        }
      } catch (err) {}
    };
    window.addEventListener('openEntityModal', handler);
    return () => window.removeEventListener('openEntityModal', handler);
  }, []);

  return (
    <>
      <DriverModal driverId={driverModalId} isOpen={showDriverModal} onClose={() => setShowDriverModal(false)} />
      <VendorModal vendorId={vendorModalId} isOpen={showVendorModal} onClose={() => setShowVendorModal(false)} />
    </>
  );
}

// Route selector: show support dashboard to support/admin, otherwise the public SupportPage
function SupportRouter() {
  const { role } = useAuth();
  if (role === 'support' || role === 'admin') return <SupportDashboard />;
  return <SupportPage />;
}

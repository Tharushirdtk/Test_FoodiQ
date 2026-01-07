import React from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { CartProvider, useCart } from './context/CartContext';
import { ThemeProvider } from './context/ThemeContext';
import { useAuth } from './context/AuthContext';
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
import AddressesPage from './pages/AddressesPage';
import FavoritesPage from './pages/FavoritesPage';
import PaymentPage from './pages/PaymentPage';
import NotificationsPage from './pages/NotificationsPage';
import SupportPage from './pages/SupportPage';
import './App.css';

function App() {
  const AuthWrapper = () => {
    const { isAuthenticated, isGuest, loading } = useAuth();
    
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
        <Route path="/" element={(!isAuthenticated && !isGuest) ? <LoginPage /> : <HomePage />} />
        <Route path="/store" element={<StorePage />} />
        <Route path="/product/:id" element={<ProductPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/order/:id" element={<OrderTrackingPage />} />
        <Route path="/account" element={<AccountPage />} />
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
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/account/addresses" element={<AddressesPage />} />
        <Route path="/account/favorites" element={<FavoritesPage />} />
        <Route path="/account/payment" element={<PaymentPage />} />
        <Route path="/account/notifications" element={<NotificationsPage />} />
        <Route path="/support" element={<SupportPage />} />
      </Routes>
    );
  };

  return (
    <ThemeProvider>
      <CartProvider>
        <ToastProvider>
          <NotificationsProvider>
            <Router>
              <div className="App">
                <AuthWrapper />
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
function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { getCartCount } = useCart();
  const pathname = location.pathname || '/';

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

  if (hidePaths.some(p => pathname.startsWith(p))) return null;

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
      <button className={`nav-item ${pathname.startsWith('/cart') ? 'active' : ''}`} onClick={() => navigate('/cart')}>
        <span className="nav-icon">🛍️</span>
        <span className="nav-label">Cart</span>
        {getCartCount() > 0 && <span className="cart-badge">{getCartCount()}</span>}
      </button>
      <button className={`nav-item ${pathname.startsWith('/account') ? 'active' : ''}`} onClick={() => navigate('/account')}>
        <span className="nav-icon">👤</span>
        <span className="nav-label">Profile</span>
      </button>
    </nav>
  );
}

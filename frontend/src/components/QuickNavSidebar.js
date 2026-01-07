import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FiPackage, FiMapPin, FiHeart, FiCreditCard, FiBell, FiMessageSquare, FiUser } from 'react-icons/fi';
import './QuickNavSidebar.css';

const quickNavItems = [
  { id: 'account', icon: <FiUser size={20} />, label: 'Profile', path: '/account', color: '#FF6B35' },
  { id: 'orders', icon: <FiPackage size={20} />, label: 'My Orders', path: '/orders', color: '#FF6B35' },
  { id: 'addresses', icon: <FiMapPin size={20} />, label: 'Addresses', path: '/account/addresses', color: '#4CAF50' },
  { id: 'favorites', icon: <FiHeart size={20} />, label: 'Favorites', path: '/account/favorites', color: '#E91E63' },
  { id: 'payment', icon: <FiCreditCard size={20} />, label: 'Payment', path: '/account/payment', color: '#2196F3' },
  { id: 'notifications', icon: <FiBell size={20} />, label: 'Notifications', path: '/account/notifications', color: '#9C27B0' },
  { id: 'support', icon: <FiMessageSquare size={20} />, label: 'Support', path: '/support', color: '#FF9800' },
];

const QuickNavSidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path) => {
    return location.pathname === path;
  };

  return (
    <aside className="quick-nav-sidebar">
      <h4>Quick Access</h4>
      <nav className="quick-nav-list">
        {quickNavItems.map((item) => (
          <button
            key={item.id}
            className={`quick-nav-item ${isActive(item.path) ? 'active' : ''}`}
            onClick={() => navigate(item.path)}
          >
            <span className="quick-nav-icon" style={{ color: isActive(item.path) ? item.color : 'var(--text-gray)' }}>
              {item.icon}
            </span>
            <span className="quick-nav-label">{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
};

export default QuickNavSidebar;

import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FiPackage, FiMapPin, FiHeart, FiCreditCard, FiBell, FiMessageSquare, FiUser, FiClock } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import orderService from '../services/orderService';
import '../styles/QuickNavSidebar.css';

const QuickNavSidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { role, user } = useAuth();
  const { on } = useSocket();
  const [assignedOrderId, setAssignedOrderId] = useState(null);
  

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        if (role === 'driver') {
          const assigned = await orderService.getAssignedOrders();
          if (!mounted) return;
          if (Array.isArray(assigned) && assigned.length > 0) setAssignedOrderId(assigned[0]._id);
          else setAssignedOrderId(null);
        }
      } catch (e) {
        // ignore
      }
    };
    load();

    const handler = (payload) => {
      try {
        console.debug('[QuickNavSidebar] orderAssigned socket', payload);
        if (!payload) return;
        // Prefer direct user id match when backend includes `assignedToUserId`
        if (payload.assignedToUserId && String(payload.assignedToUserId) === String(user?._id)) {
          setAssignedOrderId(payload.orderId);
        } else if (payload.assignedTo && payload.assignedTo._id && String(payload.assignedTo._id) === String(user?._id)) {
          // fallback: compare driver id to user id (rare)
          setAssignedOrderId(payload.orderId);
        } else if (!payload.assignedTo && payload.orderId && assignedOrderId === payload.orderId) {
          setAssignedOrderId(null);
        }
      } catch (e) { }
    };

    const offFn = on ? on('orderAssigned', handler) : null;
    return () => {
      mounted = false;
      if (offFn) offFn();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, user]);

  const baseItems = [
    { id: 'account', icon: <FiUser size={20} />, label: 'Profile', path: '/account', color: 'var(--accent-1, #FF6B35)' },
    { id: 'notifications', icon: <FiBell size={20} />, label: 'Notifications', path: '/account/notifications', color: 'var(--accent-purple, #9C27B0)' },
    { id: 'support', icon: <FiMessageSquare size={20} />, label: 'Support', path: '/support', color: 'var(--accent-orange, #FF9800)' },
  ];

  const extraForCustomers = [
    { id: 'orders', icon: <FiPackage size={20} />, label: 'My Orders', path: '/orders', color: 'var(--accent-1, #FF6B35)' },
    { id: 'addresses', icon: <FiMapPin size={20} />, label: 'Addresses', path: '/account/addresses', color: 'var(--success-color, #4CAF50)' },
    { id: 'favorites', icon: <FiHeart size={20} />, label: 'Favorites', path: '/account/favorites', color: 'var(--accent-pink, #E91E63)' },
    { id: 'payment', icon: <FiCreditCard size={20} />, label: 'Payment', path: '/account/payment', color: 'var(--info-color, #2196F3)' },
  ];

  const driverQuick = [
    { id: 'driver-history', icon: <FiClock size={20} />, label: 'History', path: '/driver/history', color: 'var(--accent-gray, #607D8B)' },
    { id: 'wallet', icon: <FiCreditCard size={20} />, label: 'Wallet', path: '/wallet', color: 'var(--success-color, #4CAF50)' }
  ];

  // Drivers should only see Profile + History + Wallet
  let quickNavItems = [];
  if (role === 'driver') {
      quickNavItems = [
      { id: 'account', icon: <FiUser size={20} />, label: 'Profile', path: '/account', color: 'var(--accent-1, #FF6B35)' },
      { id: 'notifications', icon: <FiBell size={20} />, label: 'Notifications', path: '/account/notifications', color: 'var(--accent-purple, #9C27B0)' },
      ...driverQuick
    ];
  } else if (role === 'customer') {
    // Customers: omit driver-specific quick items
    quickNavItems = [...baseItems, ...extraForCustomers];
  } else if (role === 'support') {
    // Support users: only show Profile + Notifications
    quickNavItems = baseItems.filter(item => item.id !== 'support');
  } else if (role === 'vendor') {
    // Vendors: only show Profile, Notifications, History (vendor), Wallet
    quickNavItems = [
      { id: 'account', icon: <FiUser size={20} />, label: 'Profile', path: '/account', color: 'var(--accent-1, #FF6B35)' },
      { id: 'notifications', icon: <FiBell size={20} />, label: 'Notifications', path: '/account/notifications', color: 'var(--accent-purple, #9C27B0)' },
      { id: 'vendor-history', icon: <FiClock size={20} />, label: 'History', path: '/vendor/history', color: 'var(--accent-gray, #607D8B)' },
      { id: 'wallet', icon: <FiCreditCard size={20} />, label: 'Wallet', path: '/wallet', color: 'var(--success-color, #4CAF50)' }
    ];
  } else {
    // Other roles (admin): show full set
    quickNavItems = [...baseItems, ...extraForCustomers, ...driverQuick];
  }

  const isActive = (path) => location.pathname === path;

  return (
    <aside className="quick-nav-sidebar">
      <h4>Quick Access</h4>
      <nav className="quick-nav-list">
        {quickNavItems.map((item) => (
          <button
            key={item.id}
            className={`quick-nav-item ${isActive(item.path) ? 'active' : ''}`}
            onClick={async () => {
              try {
                if (item.id === 'orders' && role === 'driver') {
                  // If driver has an assigned order, route to tracking
                  if (!assignedOrderId) {
                    const assigned = await orderService.getAssignedOrders();
                    if (Array.isArray(assigned) && assigned.length > 0) setAssignedOrderId(assigned[0]._id);
                  }
                  if (assignedOrderId) return navigate(`/order/${assignedOrderId}`);
                }
              } catch (e) {
                // ignore and fallback to default
              }
              navigate(item.path);
            }}
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

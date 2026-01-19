import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FiMessageCircle, FiUser, FiShoppingBag } from 'react-icons/fi';
import '../styles/ChatNavigator.css';
import { useAuth } from '../context/AuthContext';

const ChatNavigator = ({ order, orderId }) => {
  const navigate = useNavigate();
  const { role } = useAuth();

  if (!order) return null;

  const vendorAddresses = order?.vendorAddresses || (order?.vendorAddress ? [order.vendorAddress] : []);
  const customer = order?.user;
  const driver = order?.driver;

  const items = [];
  // helper to resolve id/label when field may be populated or a raw id
  const resolveId = (val, fallback) => (val && (typeof val === 'string' || val instanceof String) ? val : (val && val._id ? val._id : fallback));
  const resolveLabel = (val, fallback) => (val && (val.displayName || val.name)) || val?.label || fallback;

  if (customer) items.push({ id: String(resolveId(customer, 'customer')), label: resolveLabel(customer, 'Customer'), type: 'customer' });

  // Build vendor entries from vendorAddresses and from items[].vendor (deduplicated)
  const vendorMap = new Map();
  // prefer vendor store name when available
  const getVendorLabel = (val, addressLabel, fallback) => {
    if (val && typeof val === 'object') {
      if (val.vendorProfile && val.vendorProfile.storeName) return val.vendorProfile.storeName;
      if (val.storeName) return val.storeName;
      if (val.displayName || val.name) return val.displayName || val.name;
    }
    return addressLabel || fallback || 'Vendor';
  };
  // vendorAddresses first (keeps intended ordering)
  vendorAddresses.forEach((v, idx) => {
    const vid = resolveId(v.vendor, `vendor-${idx}`);
    const vlabel = getVendorLabel(v.vendor, v.label || `Vendor ${idx + 1}`);
    vendorMap.set(String(vid), { id: String(vid), label: vlabel, type: 'vendor' });
  });
  // fallback to items[].vendor when vendorAddresses is empty or to include missing vendors
  if ((!vendorAddresses || vendorAddresses.length === 0) && Array.isArray(order.items)) {
    for (const it of order.items) {
      if (!it || !it.vendor) continue;
      const vid = resolveId(it.vendor, null);
      if (!vid) continue;
      if (!vendorMap.has(String(vid))) {
        const vlabel = getVendorLabel(it.vendor, null, 'Vendor');
        vendorMap.set(String(vid), { id: String(vid), label: vlabel, type: 'vendor' });
      }
    }
  }
  for (const v of vendorMap.values()) items.push(v);

  if (driver) items.push({ id: String(resolveId(driver, 'driver')), label: resolveLabel(driver, 'Driver'), type: 'driver' });

  // Filter items per role to show only the desired chats
  let filtered = items;
  if (role === 'customer') {
    // customers should see driver and vendor(s) chats (not themselves)
    filtered = items.filter(i => i.type !== 'customer');
  } else if (role === 'vendor') {
    // vendors should see customer and assigned driver chats (not vendor self entries)
    filtered = items.filter(i => i.type !== 'vendor');
  } else if (role === 'driver') {
    // drivers should see customer and vendor(s) chats (not driver self)
    filtered = items.filter(i => i.type !== 'driver');
  }

  return (
    <aside className="chat-navigator" aria-label="Chat navigator">
      <div className="chat-nav-header">Chat Navigator</div>
      <div className="chat-nav-list">
        {filtered.map((item) => (
          <button
            key={item.id}
            className="chat-nav-item"
            onClick={() => { console.debug('ChatNavigator: navigate to chat', { orderId, participant: item.id, label: item.label }); navigate(`/order/${orderId}/chat?participant=${item.id}`); }}
            type="button"
          >
            <span className="chat-nav-icon">{item.type === 'vendor' ? <FiShoppingBag /> : <FiUser />}</span>
            <span className="chat-nav-label">{item.label}</span>
            <span className={`chat-role-tag role-${item.type}`}>{item.type === 'vendor' ? 'Vendor' : item.type === 'driver' ? 'Driver' : 'Customer'}</span>
            <span className="chat-nav-action"><FiMessageCircle /></span>
          </button>
        ))}
      </div>
    </aside>
  );
};

export default ChatNavigator;

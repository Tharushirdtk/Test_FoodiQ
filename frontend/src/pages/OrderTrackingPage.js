import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { FiArrowLeft, FiPhone, FiMessageSquare, FiCheck, FiPackage, FiTruck } from 'react-icons/fi';
import '../styles/OrderTrackingPage.css';
import { useSocket } from '../context/SocketContext';
import orderService from '../services/orderService';
import ConfirmDialog from '../components/ConfirmDialog';

const OrderTrackingPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  useCart();
  const { joinOrder, leaveOrder, on } = useSocket();
  const [liveOrder, setLiveOrder] = useState(null);

  // Random driver names and phone numbers
  const driverNames = ['Liyanage', 'Athukorala', 'Vitharana', 'Kannangara'];
  const driverPhones = ['+94 77 123 4567', '+94 76 234 5678', '+94 75 345 6789', '+94 71 456 7890'];
  const driverIndex = Math.floor(Math.random() * driverNames.length);
  const randomDriver = driverNames[driverIndex];
  const driverPhone = driverPhones[driverIndex];

  const [showDriverDialog, setShowDriverDialog] = useState(false);
  const [driverDialogMessage, setDriverDialogMessage] = useState('');

  const handleShowDriverPhone = () => {
    setDriverDialogMessage(`Driver's Phone: ${driverPhone}`);
    setShowDriverDialog(true);
  };

  // Build status timeline dynamically using order timestamps when available
  const statusFlow = [
    { key: 'pending', title: 'Order Placed', icon: <FiCheck size={20} /> },
    { key: 'confirmed', title: 'Order Confirmed', icon: <FiCheck size={20} /> },
    { key: 'preparing', title: 'Preparing your meal', icon: <FiPackage size={20} /> },
    { key: 'ready', title: 'Ready for Pickup', icon: <FiPackage size={20} /> },
    { key: 'delivering', title: 'Out for Delivery', icon: <FiTruck size={20} /> },
    { key: 'delivered', title: 'Delivered', icon: <FiCheck size={20} /> },
  ];

  const formatTimestamp = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const currentStatus = liveOrder?.status || 'pending';
  const createdAt = liveOrder?.createdAt;
  const updatedAt = liveOrder?.updatedAt;
  const currentIndex = statusFlow.findIndex(s => s.key === currentStatus);

  // tracking view does not require item list or totals

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await orderService.getOrder(id);
        if (!mounted) return;
        setLiveOrder(data);
      } catch (e) {
        // ignore
      }
    })();

    joinOrder(id);
    const off = on('orderUpdate', (payload) => {
      if (payload && (payload.orderId === id || payload.orderId === payload.orderId?.toString())) {
        setLiveOrder((prev) => ({ ...(prev || {}), ...payload.order }));
      }
    });

    return () => { mounted = false; off && off(); leaveOrder(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <div className="order-tracking-page">
      {/* Header */}
      <header className="tracking-header">
        <button className="btn btn-icon" onClick={() => navigate('/orders')}>
          <FiArrowLeft size={24} />
        </button>
        <div className="header-info">
          <h1>Order #{id}</h1>
          <span className="order-badge">ON TIME</span>
        </div>
        <button className="btn-text help-btn">Help</button>
      </header>

      <div className="tracking-content">
        {/* Arrival Info */}
        <div className="arrival-card">
          <div className="arrival-icon">🚚</div>
          <div className="arrival-info">
            <h2>Arriving in 15-20 mins</h2>
            <p>Estimated arrival: 3:45 PM</p>
          </div>
            <ConfirmDialog
              isOpen={showDriverDialog}
              onClose={() => setShowDriverDialog(false)}
              onConfirm={() => {
                // attempt to call via tel: link on devices that support it
                try { window.location.href = `tel:${driverPhone.replace(/\s+/g, '')}`; } catch (e) {}
              }}
              title="Contact Driver"
              message={driverDialogMessage}
              confirmText="Call"
              cancelText="OK"
              variant="info"
            />
        </div>

        {/* Driver Info */}
        <div className="driver-card">
          <div className="driver-image">👤</div>
          <div className="driver-info">
            <h3>{randomDriver}</h3>
            <p>Your Delivery Plus Driver</p>
            <div className="driver-rating">
              ⭐ 4.9 • 1,234 trips
            </div>
          </div>
          <div className="driver-actions">
              <button className="btn btn-icon contact-btn" onClick={handleShowDriverPhone}>
              <FiPhone size={20} />
            </button>
              <button className="btn btn-icon contact-btn" onClick={handleShowDriverPhone}>
              <FiMessageSquare size={20} />
            </button>
          </div>
        </div>

        {/* Order Status Timeline */}
        <div className="status-section">
          <h2>Order Status</h2>
          <div className="status-timeline">
            {statusFlow.map((step, index) => {
              const stepIndex = index;
              const completed = currentIndex > -1 && stepIndex < currentIndex;
              const active = currentIndex === stepIndex;

              // Determine timestamp to show: createdAt for first step, updatedAt for current step,
              // and show createdAt for earlier completed steps as a fallback.
              let timeLabel = '';
              if (stepIndex === 0) timeLabel = formatTimestamp(createdAt);
              else if (active) timeLabel = formatTimestamp(updatedAt) || '';
              else if (completed) timeLabel = formatTimestamp(updatedAt) || formatTimestamp(createdAt) || '';

              return (
                <div key={step.key} className={`status-item ${completed ? 'completed' : ''} ${active ? 'active' : ''}`}>
                  <div className="status-icon-wrapper">
                    <div className="status-icon">{step.icon}</div>
                    {index < statusFlow.length - 1 && <div className="status-line"></div>}
                  </div>
                  <div className="status-content">
                    <div className="status-header">
                      <h4>{step.title}</h4>
                      <span className="status-time">{timeLabel}</span>
                    </div>
                    <p className="status-description">{step.title === 'Order Placed' ? 'We received your order' : ''}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Cancel Order */}
        <button className="btn cancel-order-btn">
          Cancel Order
        </button>
      </div>
    </div>
  );
};

export default OrderTrackingPage;

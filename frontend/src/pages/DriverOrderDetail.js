import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FiArrowLeft } from 'react-icons/fi';
import orderService from '../services/orderService';
import '../styles/DriverOrderDetail.css';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useToast } from '../context/ToastContext';

const DriverOrderDetail = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user, role } = useAuth();
  const { joinOrder, leaveOrder, on } = useSocket();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pickupOrder, setPickupOrder] = useState([]);
  const [viewersCount, setViewersCount] = useState(0);
  const [assignedByOther, setAssignedByOther] = useState(null);
  const toast = useToast();
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // If this driver already has an active assigned order, redirect to that order's tracking
        if (role === 'driver') {
          try {
            const assigned = await orderService.getAssignedOrders();
            if (Array.isArray(assigned) && assigned.length > 0) {
              const myAssigned = assigned.find(o => o && o.driver && ['driver_assigned', 'out_for_delivery'].includes((o.status || '').toString())) || null;
              if (myAssigned && String(myAssigned._id) !== String(id)) {
                navigate(`/order/${myAssigned._id}`);
                return;
              }
            }
          } catch (e) {}
        }
      } catch (e) {}
      try {
        setLoading(true);
        const data = await orderService.getOrder(id);
        if (!mounted) return;
        // If a driver is viewing this page, enforce access rules:
        // - If the order has NO assigned driver -> allow viewing so drivers can claim it.
        // - If the order is assigned to this driver -> allow viewing.
        // - If the order is assigned to someone else -> show a message that it's assigned to another driver (do NOT redirect to homepage).
        if (role === 'driver') {
          try {
            const userId = user && (user._id || user.id);
            const drv = data.driver;
            let orderDriverId = null;
            if (drv) {
              if (typeof drv === 'string' || typeof drv === 'number') orderDriverId = drv;
              else if (drv._id) orderDriverId = drv._id;
              else if (drv.user) orderDriverId = drv.user._id || drv.user;
            }

            const nameMatches = drv && drv.name && (user && (user.displayName || user.name)) && String(drv.name) === String((user.displayName || user.name));
            const isAssigned = !!(orderDriverId || nameMatches);
            const assignedToMe = isAssigned && ((orderDriverId && String(orderDriverId) === String(userId)) || !!nameMatches);

            if (!isAssigned) {
              // no driver assigned -> allow driver to view and potentially claim
            } else if (assignedToMe) {
              // assigned to this driver -> allow
            } else {
              // assigned to someone else -> show message (preserve order null so UI shows assigned banner)
              const assignedInfo = drv && (typeof drv === 'object' ? drv : { name: String(drv) });
              setAssignedByOther(assignedInfo || { name: 'another driver' });
              setOrder(null);
              return;
            }
          } catch (e) {
            // ignore and continue
          }
        }
        setOrder(data);
        // Build pickupOrder: prefer vendorAddresses/vendorAddress, otherwise derive from items
        if (Array.isArray(data.vendorAddresses) && data.vendorAddresses.length > 0) {
          setPickupOrder(data.vendorAddresses.slice());
        } else if (data.vendorAddress) {
          setPickupOrder([data.vendorAddress]);
        } else if (Array.isArray(data.items) && data.items.length > 0) {
          const vendorMap = new Map();
          for (const it of data.items) {
            try {
              const v = it.vendor;
              const vid = v && (v._id || v.id) ? (v._id || v.id) : v;
              if (!vid) continue;
              if (!vendorMap.has(String(vid))) {
                const label = (v && v.vendorProfile && (v.vendorProfile.storeName)) || (v && (v.displayName || v.name)) || 'Vendor';
                const street = (v && v.vendorProfile && v.vendorProfile.storeAddress && (v.vendorProfile.storeAddress.street || v.vendorProfile.storeAddress.label || v.vendorProfile.storeAddress.formatted)) || it.label || '';
                vendorMap.set(String(vid), { vendor: vid, label, address: street });
              }
            } catch (e) { /* ignore per-item parse errors */ }
          }
          setPickupOrder(Array.from(vendorMap.values()));
        } else {
          setPickupOrder([]);
        }
      } catch (e) {
        console.error(e);
        setError('Failed to load order');
      } finally {
        setLoading(false);
      }
    })();

    const offUpdate = on('orderUpdate', (payload) => {
      if (!payload || payload.orderId !== id) return;
      setOrder((prev) => ({ ...(prev || {}), ...payload.order }));
    });
    const offAssigned = on('orderAssigned', (payload) => {
      if (!payload || payload.orderId !== id) return;
      try {
        const assignedTo = payload.assignedTo;
        const assignedName = assignedTo && (assignedTo.name || assignedTo._id);
        const myName = user?.displayName || user?.name;
        if (assignedName && myName && String(assignedName) !== String(myName)) {
          // assigned to another driver — hide details and show message only
          setAssignedByOther(assignedTo || { name: 'another driver' });
          setOrder(null);
        } else {
          // assigned to me or unassigned — refresh order
          (async () => {
            try { const d = await orderService.getOrder(id); setOrder(d); } catch (e) {}
          })();
        }
      } catch (e) {}
    });
    const offViewers = on('order:viewers', (payload) => {
      if (!payload || payload.orderId !== id) return;
      setViewersCount(Array.isArray(payload.viewers) ? payload.viewers.length : 0);
    });

    // join after listeners registered so we don't miss the immediate viewers payload
    joinOrder(id);

    return () => { mounted = false; offUpdate && offUpdate(); offAssigned && offAssigned(); offViewers && offViewers(); leaveOrder(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const onDragStart = (e, idx) => {
    try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(idx)); } catch (_) { try { e.dataTransfer.setData('text', String(idx)); } catch (_) {} }
  };

  const onDrop = (e, targetIdx) => {
    e.preventDefault();
    const src = Number(e.dataTransfer.getData('text/plain'));
    if (isNaN(src)) return;
    if (src === targetIdx) return;
    const copy = pickupOrder.slice();
    const [moved] = copy.splice(src, 1);
    copy.splice(targetIdx, 0, moved);
    setPickupOrder(copy);
  };

  const onDragOver = (e) => e.preventDefault();

  const moveUp = (idx) => {
    if (idx <= 0) return;
    const copy = pickupOrder.slice();
    const t = copy[idx - 1]; copy[idx - 1] = copy[idx]; copy[idx] = t;
    setPickupOrder(copy);
  };
  const moveDown = (idx) => {
    if (idx >= pickupOrder.length - 1) return;
    const copy = pickupOrder.slice();
    const t = copy[idx + 1]; copy[idx + 1] = copy[idx]; copy[idx] = t;
    setPickupOrder(copy);
  };

  // Prefer authoritative backend `order.total`. Frontend should not compute totals here.

  const handleAssign = async () => {
    if (assigning) return;
    try {
      setAssigning(true);
      const payload = { vendorPickupOrder: pickupOrder };
      try {
        console.debug('[DriverOrderDetail] handleAssign called', { orderId: id, user: user && { id: user._id, name: user.displayName || user.name }, payloadSample: Array.isArray(payload.vendorPickupOrder) ? payload.vendorPickupOrder.slice(0,3) : payload.vendorPickupOrder });
      } catch (logErr) {}
      const res = await orderService.assignOrder(id, payload);
      // assigned — update local order
      const updated = res.order || (await orderService.getOrder(id));
      try { console.debug('[DriverOrderDetail] assign response', { orderId: id, res: !!res, updatedId: updated && updated._id }); } catch (logErr) {}
      setOrder(updated);
      if (toast && typeof toast.showToast === 'function') toast.showToast('Order assigned to you', { type: 'success' });
      // Redirect driver to the order tracking page
      navigate(`/order/${id}`);
    } catch (e) {
      if (e && e.response && e.response.status === 409) {
        const msg = (e.response.data && e.response.data.message) || 'Conflict when assigning';
        if (toast && typeof toast.showToast === 'function') toast.showToast(msg, { type: 'error' });
      } else {
        console.error('[DriverOrderDetail] Assign failed', e && (e.response || e.message ? (e.response && e.response.data ? e.response.data : e.message) : e));
        if (toast && typeof toast.showToast === 'function') toast.showToast('Assign failed', { type: 'error' });
      }
    } finally {
      setAssigning(false);
    }
  };

  const updateStatus = async (status) => {
    try {
      const res = await orderService.updateOrderStatus(id, status);
      setOrder(res.order || res);
    } catch (e) {
      console.error('Status update failed', e);
      if (toast && typeof toast.showToast === 'function') toast.showToast('Status update failed', { type: 'error' });
    }
  };

  // If driver and primary contact not verified, show verification message only
  if (role === 'driver' && user && !user.phoneVerified) {
    return (
      <div className="sub-page driver-order-detail">
        <header className="account-header">
          <button className="btn btn-icon" onClick={() => navigate(-1)}><FiArrowLeft /></button>
          <h1>Order #{String(id).slice(-6).toUpperCase()}</h1>
          <div style={{ width: 48 }} />
        </header>
        <div className="sub-content">
          <div className="error-message">You must verify your primary contact number to access order tracking. Please verify your phone number in your account settings.</div>
          <div style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => navigate('/account', { state: { openSection: 'contact' } })}>Verify Phone</button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) return <div className="sub-content"><div className="loading-spinner" /></div>;
  if (error) return <div className="sub-content error-message">{error}</div>;
  if (assignedByOther) return (
    <div className="sub-page driver-order-detail">
      <header className="account-header">
        <button className="btn btn-icon" onClick={() => navigate(-1)}><FiArrowLeft /></button>
        <h1>Order #{String(id).slice(-6).toUpperCase()}</h1>
        <div style={{ width: 48 }} />
      </header>
      <div className="sub-content">
        <div className="cancelled-banner">Order was assigned to {assignedByOther.name || 'another driver'}. You no longer have access.</div>
      </div>
    </div>
  );

  if (!order) return <div className="sub-content">Order not available.</div>;

  return (
    <div className="sub-page driver-order-detail">
      <header className="account-header">
        <button className="btn btn-icon" onClick={() => navigate(-1)}><FiArrowLeft /></button>
        <h1>Order #{String(order._id).slice(-6).toUpperCase()}</h1>
        <div style={{ width: 48 }} />
      </header>

      <div className="sub-content">
        <div className="detail-grid">
          <div className="detail-col">
            <section className="section">
              <h3>Pickup sequence</h3>
              {pickupOrder && pickupOrder.length > 1 && (
                <p className="muted">Drag to reorder or use arrows. Changes are local until you assign.</p>
              )}
              <ul className="pickup-list">
                {pickupOrder.map((addr, idx) => (
                  <li key={idx} className="pickup-item" draggable onDragStart={(e) => onDragStart(e, idx)} onDragOver={onDragOver} onDrop={(e) => onDrop(e, idx)}>
                    <div className="pickup-left">
                      <div className="pickup-index">{idx + 1}</div>
                      <div className="pickup-body">
                        <div className="pickup-title">{addr.label || addr.name || addr.storeName || `Vendor ${idx + 1}`}</div>
                        <div className="pickup-sub">{addr.address || addr.street || addr.formatted || addr.label || ''}</div>
                      </div>
                    </div>
                    {pickupOrder && pickupOrder.length > 1 && (
                      <div className="pickup-controls">
                        <button className="btn btn-icon small" onClick={() => moveUp(idx)}>▲</button>
                        <button className="btn btn-icon small" onClick={() => moveDown(idx)}>▼</button>
                      </div>
                    )}
                  </li>
                ))}
                <li className="pickup-item customer">
                  <div className="pickup-left">
                    <div className="pickup-index">C</div>
                    <div className="pickup-body">
                      <div className="pickup-title">Customer</div>
                      <div className="pickup-sub">{order.address?.street || order.address?.label || ''}</div>
                    </div>
                  </div>
                </li>
              </ul>
            </section>

            <section className="section">
              <h3>Order summary</h3>
              <div className="muted">{order.items?.length || 0} items • Rs {Number(order.subtotal || 0).toLocaleString()}</div>
              <div style={{ marginTop: 12 }}>
                {order.items?.map((it, i) => {
                  const v = it.vendor;
                  const vendorLabel = v && typeof v === 'object' ? (v.vendorProfile && v.vendorProfile.storeName) || v.displayName || v.name : (v || '');
                  return (
                    <div key={i} className="item-row">
                      <div>
                        <div>{it.name} x{it.quantity}</div>
                        {vendorLabel ? <div className="muted" style={{ fontSize: 12 }}>{vendorLabel}</div> : null}
                      </div>
                      <div />
                    </div>
                  );
                })}

                {order.deliveryNote && (
                  <div style={{ marginTop: 12 }}>
                    <strong>Delivery note:</strong>
                    <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-light)' }}>{order.deliveryNote}</div>
                  </div>
                )}

                <div style={{ marginTop: 12 }}>
                  <div className="item-row muted"><div>Subtotal</div><div>Rs {Number(order.subtotal || 0).toLocaleString()}</div></div>
                  {order.deliveryFee ? <div className="item-row muted"><div>Delivery fee</div><div>Rs {Number(order.deliveryFee || 0).toLocaleString()}</div></div> : null}
                  <div style={{ marginTop: 8, fontWeight: 700 }}>Total: Rs {Number(order.total || 0).toLocaleString()}</div>
                </div>
              </div>
            </section>
          </div>

          <aside className="detail-side">
            <div className="card">
              <h4>Earnings</h4>
              <div className="muted">Driver cut (estimated)</div>
              <div className="big">Rs {Number(order.driverRevenue || 0).toLocaleString()}</div>
              <div style={{ marginTop: 8 }} className="muted">Platform cut (delivery)</div>
              <div>Rs {Number(order.driverPlatformCut || 0).toLocaleString()}</div>
            </div>

            <div className="card">
              <h4>Viewers</h4>
              <div className="muted">Drivers currently viewing this order</div>
              <div className="big">{viewersCount}</div>
            </div>

            {!order.driver && !assignedByOther && (
              <button className="btn primary full" onClick={handleAssign} style={{ marginTop: 12 }} disabled={assigning}>
                {assigning ? 'Assigning…' : 'Assign to me'}
              </button>
            )}

            {order.driver && (
              <div className="muted">Assigned to {order.driver?.name || 'a driver'}</div>
            )}

            {/* Status actions for assigned drivers */}
            {order.driver && order.status === 'ready_for_pickup' && (
              <button className="btn full" style={{ marginTop: 10 }} onClick={() => updateStatus('out_for_delivery')}>Mark Out for Delivery</button>
            )}
            {order.driver && (order.status === 'order_picked_up' || order.status === 'out_for_delivery') && (
              <button className="btn full" style={{ marginTop: 10 }} onClick={() => updateStatus('delivered')}>Mark Delivered</button>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
};

export default DriverOrderDetail;

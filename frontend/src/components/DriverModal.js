import React, { useEffect, useState, useRef, useCallback } from 'react';
import api from '../utils/apiClient';
import { FiX } from 'react-icons/fi';
import StarRating from './StarRating';
import LoadingSpinner from './LoadingSpinner';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import Pagination from './Pagination';
import '../styles/VendorModal.css';

export default function DriverModal({ driverId, isOpen, onClose, orderId = null }) {
  const { user } = useAuth();
  const { on } = useSocket();
  const [driver, setDriver] = useState(null);
  const [ratings, setRatings] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [myRating, setMyRating] = useState({ rating: 0, text: '' });
  const [canRate, setCanRate] = useState(null);
  const [userReview, setUserReview] = useState(null);
  const [resolvedOrderId, setResolvedOrderId] = useState(orderId || null);

  // Fetch driver ratings (stable via refs; no changing deps)
  const fetchRatings = useCallback(async (pageToFetch = 1) => {
    const did = driverIdRef.current;
    if (!did) return;
    setError('');
    setLoading(true);
    try {
      const res = await api.get(`/ratings`, { params: { entityType: 'driver', entityId: did, page: pageToFetch, pageSize: 5 } });
      const data = res.data || {};
      const reviews = data.reviews ?? data.items ?? data.data ?? [];
      const pagination = data.pagination ?? data.meta ?? {};
      const finalReviews = Array.isArray(reviews) ? reviews : [];
      setRatings(finalReviews);
      setPages(pagination.pages ?? pagination.totalPages ?? 1);
      if (typeof data.canRate !== 'undefined') setCanRate(Boolean(data.canRate));
      if (!resolvedOrderIdRef.current && data && data.canRateOrderId) setResolvedOrderId(data.canRateOrderId);
      try {
        const usr = userRef.current;
        if (usr) {
          const my = finalReviews.find(r => r && r.user && (String(r.user._id || r.user.id) === String(usr._id || usr.id)));
          if (my) {
            setUserReview(my);
            setMyRating({ rating: Number(my.rating) || 0, text: my.text || '' });
          } else {
            setUserReview(null);
          }
        }
      } catch (e) { /* ignore */ }
    } catch (e) {
      console.error('Failed to load driver ratings', e);
      setError('Failed to load ratings');
    } finally {
      setLoading(false);
    }
  }, []);

  // refs to keep latest values for stable callback
  const driverIdRef = useRef(driverId);
  const userRef = useRef(user);
  const resolvedOrderIdRef = useRef(resolvedOrderId);
  useEffect(() => { driverIdRef.current = driverId; }, [driverId]);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { resolvedOrderIdRef.current = resolvedOrderId; }, [resolvedOrderId]);

  // keep a stable ref to the latest fetchRatings so socket listeners can call it
  const fetchRatingsRef = useRef(fetchRatings);
  useEffect(() => { fetchRatingsRef.current = fetchRatings; }, [fetchRatings]);

  useEffect(() => {
    if (!isOpen) return;
    const initialResolved = orderId || null;
    setMyRating({ rating: 0, text: '' });
    setResolvedOrderId(initialResolved);
    let mounted = true;
    (async () => {
      try {
        setError('');
        setLoading(true);
        const [driverRes, ratingsRes] = await Promise.allSettled([
          api.get(`/users/${driverId}`),
          api.get(`/ratings`, { params: { entityType: 'driver', entityId: driverId, page, pageSize: 5 } }),
        ]);

        if (!mounted) return;

        if (driverRes.status === 'fulfilled') {
          const d = driverRes.value.data.user ?? driverRes.value.data ?? null;
          setDriver(d);
        } else {
          console.warn('Driver fetch failed', driverRes.reason);
          setDriver(null);
        }

        if (ratingsRes.status === 'fulfilled') {
          const data = ratingsRes.value.data;
          const reviews = data.reviews ?? data.items ?? data.data ?? [];
          const pagination = data.pagination ?? data.meta ?? {};
          const finalReviews = Array.isArray(reviews) ? reviews : [];
          setRatings(finalReviews);
          setPages(pagination.pages ?? pagination.totalPages ?? 1);
          if (typeof data.canRate !== 'undefined') setCanRate(Boolean(data.canRate));
          if (!initialResolved && data && data.canRateOrderId) setResolvedOrderId(data.canRateOrderId);
          try {
            const usr = userRef.current || user;
            if (usr) {
              const my = finalReviews.find(r => r && r.user && (String(r.user._id || r.user.id) === String(usr._id || usr.id)));
              if (my) {
                setUserReview(my);
                setMyRating({ rating: Number(my.rating) || 0, text: my.text || '' });
              } else {
                setUserReview(null);
              }
            }
          } catch (e) { /* ignore */ }
        } else {
          console.warn('Ratings fetch failed', ratingsRes.reason);
          setRatings([]);
          setPages(1);
        }
      } catch (e) {
        console.error(e);
        setError('Failed to load driver information');
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [isOpen, driverId, page, orderId, user]);

  // Listen for realtime driver updates and refresh when affected
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!driverId) return;
    let mounted = true;
    const off = on('driverUpdated', async (payload) => {
      try {
        if (!mounted || !payload) return;
        const pUserId = payload.userId && String(payload.userId);
        const pDriverId = payload.driverId && String(payload.driverId);
        // If the payload references this driver (either by driver doc id or user id), refresh
        if (pDriverId === String(driverId) || pUserId === String(driverId) || pUserId === String(driver?._id) || pDriverId === String(driver?._id)) {
          await fetchRatingsRef.current(1);
          try {
            const dres = await api.get(`/users/${driverId}`);
            const d = dres.data.user ?? dres.data ?? null;
            if (mounted) setDriver(d);
          } catch (e) { /* ignore */ }
        }
      } catch (e) { /* ignore */ }
    });
    return () => { mounted = false; off && off(); };
  }, [on, driverId, driver]);
  

  const submitRating = async () => {
    setError('');
    const orderToUse = resolvedOrderId || orderId || null;
    if (!orderToUse) {
      setError('Ratings are only allowed after an order completes. Please rate from the delivered order notification.');
      return;
    }
    if (!myRating.rating || myRating.rating < 1) {
      setError('Please provide a rating (1-5).');
      return;
    }
    try {
      setLoading(true);
      await api.post('/ratings', { entityType: 'driver', entityId: driverId, rating: myRating.rating, text: myRating.text, orderId: orderToUse });
      setMyRating({ rating: 0, text: '' });
      setPage(1);
      await fetchRatings(1);
    } catch (e) {
      console.error('Failed to submit rating', e);
      setError(e?.response?.data?.message || 'Failed to submit rating');
    } finally { setLoading(false); }
  };

  const removeRating = async () => {
    if (!userReview || !userReview._id) return;
    setError('');
    try {
      setLoading(true);
      await api.delete(`/ratings/${userReview._id}`);
      setUserReview(null);
      setMyRating({ rating: 0, text: '' });
      setPage(1);
      await fetchRatings(1);
    } catch (e) {
      console.error('Failed to remove rating', e);
      setError(e?.response?.data?.message || 'Failed to remove rating');
    } finally { setLoading(false); }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={() => typeof onClose === 'function' && onClose()}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 760 }} role="dialog" aria-modal="true">
        <div className="modal-header">
          <h2>Driver</h2>
          <button className="modal-close" onClick={() => { setMyRating({ rating: 0, text: '' }); typeof onClose === 'function' && onClose(); }} aria-label="Close">
            <FiX size={20} />
          </button>
        </div>

        <div className="modal-body">
          {loading ? (
            <div style={{ textAlign: 'center', padding: 24 }}><LoadingSpinner /></div>
          ) : (
            <>
              <div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: 72, height: 72, borderRadius: 8, background: '#f4f4f4', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {driver?.avatar ? (
                      <img src={driver.avatar && (driver.avatar.startsWith('http') || driver.avatar.startsWith('data:')) ? driver.avatar : `${driver.avatar}`} alt="driver" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ fontSize: 28 }}>🚗</div>
                    )}
                  </div>
                  {driver?.driverProfile?.vehicleImage ? (
                    <div style={{ width: 72, height: 72, borderRadius: 8, overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img src={driver.driverProfile.vehicleImage} alt="vehicle" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  ) : null}
                </div>

                <div className="details-grid" style={{ marginTop: 12 }}>
                  <div className="detail-item">
                    <div className="detail-content">
                      <span className="detail-label">Name</span>
                      <span className="detail-value">{driver?.displayName || driver?.name || 'Not set'}</span>
                    </div>
                  </div>
                  <div className="detail-item">
                    <div className="detail-content">
                      <span className="detail-label">Vehicle Type</span>
                      <span className="detail-value">{driver?.driverProfile?.vehicleType || 'Not set'}</span>
                    </div>
                  </div>
                  <div className="detail-item">
                    <div className="detail-content">
                      <span className="detail-label">Phone</span>
                      <span className="detail-value">{driver?.phone || 'Not set'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {error && (
                <div className="form-group" style={{ marginTop: 8 }}>
                  <div style={{ color: 'var(--danger-color, #d32f2f)' }}>{error}</div>
                </div>
              )}

              <div style={{ height: 1, background: 'var(--border-color)', margin: '16px 0' }} />

              <div className="form-group">
                <h4 style={{ margin: 0, marginBottom: 8 }}>{userReview ? 'Update rating' : 'Leave a rating'}</h4>
                {canRate === false && !userReview && (
                  <div className="verification-warning" style={{ marginTop: 8 }}>
                    <div className="warning-content">
                      <p className="warning-text" style={{ margin: 0 }}>Ratings are limited to users who participated in a delivered order involving this driver. Please rate from your order details or the delivered order notification.</p>
                    </div>
                  </div>
                )}
                {(canRate !== false || userReview) && (
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <StarRating value={myRating.rating} onChange={(v) => setMyRating((s) => ({ ...s, rating: v }))} interactive={true} size={22} />
                    <textarea placeholder="Leave a short comment (optional)" value={myRating.text} onChange={(e) => setMyRating((s) => ({ ...s, text: e.target.value }))} style={{ flex: 1, minHeight: 80 }} />
                  </div>
                )}
              </div>

              <div style={{ height: 1, background: 'var(--border-color)', margin: '16px 0' }} />

              <div className="form-group">
                <h4 style={{ margin: 0, marginBottom: 8 }}>Ratings</h4>
                {ratings.length === 0 ? (
                  <p style={{ margin: 0 }}>No ratings yet</p>
                ) : (
                  <div>
                    {ratings.map((r) => (
                      <div key={r._id || r.id} style={{ borderBottom: '1px solid var(--border-color, #eee)', padding: '12px 0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ fontWeight: 600 }}>{r.user?.displayName || r.user?.name || 'User'}</div>
                          <div>
                            <StarRating value={r.rating} interactive={false} size={16} />
                          </div>
                        </div>
                        {r.text && <div style={{ marginTop: 8 }}>{r.text}</div>}
                        <div style={{ color: 'var(--text-muted, #999)', fontSize: 12, marginTop: 8 }}>{(r.updatedAt || r.createdAt) ? new Date(r.updatedAt || r.createdAt).toLocaleString() : ''}</div>
                      </div>
                    ))}

                    <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>
                      <Pagination page={page} pages={pages} total={ratings.length} perPage={5} onChange={(p) => setPage(p)} />
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {(canRate !== false || userReview) && (
          <div className="modal-footer" style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              {userReview && (
                <button onClick={removeRating} className="btn btn-outline" disabled={loading}>
                  {loading ? 'Removing...' : 'Remove Rating'}
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setMyRating({ rating: 0, text: '' }); typeof onClose === 'function' && onClose(); }} className="btn btn-cancel">
                Cancel
              </button>
              <button onClick={submitRating} className="btn btn-submit" disabled={loading}>
                {loading ? 'Please wait...' : (userReview ? 'Update' : 'Submit')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

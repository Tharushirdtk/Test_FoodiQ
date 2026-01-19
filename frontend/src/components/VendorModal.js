import React, { useEffect, useState } from "react";
import { useNavigate } from 'react-router-dom';
import { useAuth } from "../context/AuthContext";
import api from '../utils/apiClient';
import { FiX } from "react-icons/fi";
import StarRating from "./StarRating";
import LoadingSpinner from "./LoadingSpinner";
import Pagination from './Pagination';
import '../styles/VendorModal.css';

export default function VendorModal({
  vendorId,
  isOpen,
  onClose,
  orderId = null,
}) {
  const { user } = useAuth();
  const [vendor, setVendor] = useState(null);
  const [ratings, setRatings] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [myRating, setMyRating] = useState({ rating: 0, text: "" });
  const [canRate, setCanRate] = useState(null);
  const [userReview, setUserReview] = useState(null);
  const [resolvedOrderId, setResolvedOrderId] = useState(orderId || null);

  const API = process.env.REACT_APP_API_URL || 'http://localhost:5000';

  const openMapsForAddress = (addr) => {
    try {
      const q = encodeURIComponent(addr || "");
      window.open(`https://www.google.com/maps/search/?api=1&query=${q}`, "_blank");
    } catch (e) {}
  };

  const formatStoreAddress = (storeAddress) => {
    if (!storeAddress) return '';
    if (typeof storeAddress === 'string') return storeAddress;
    const parts = [];
    if (storeAddress.street) parts.push(storeAddress.street);
    const cityParts = [];
    if (storeAddress.city) cityParts.push(storeAddress.city);
    if (storeAddress.state) cityParts.push(storeAddress.state);
    if (storeAddress.zip) cityParts.push(storeAddress.zip);
    if (cityParts.length) parts.push(cityParts.join(', '));
    if (storeAddress.country) parts.push(storeAddress.country);
    return parts.join(', ');
  };

  const navigate = useNavigate();

  // Fetch vendor info + ratings
  const fetchRatings = async (pageToFetch = 1) => {
    if (!vendorId) return;
    setError("");
    setLoading(true);
    try {
      const ratingsRes = await api.get(`/ratings`, {
        params: {
          entityType: "vendor",
          entityId: vendorId,
          page: pageToFetch,
          pageSize: 5,
        },
      });

      // Some APIs return reviews in different shapes — be defensive
      const reviews = ratingsRes.data.reviews ?? ratingsRes.data.items ?? ratingsRes.data.data ?? [];
      const pagination = ratingsRes.data.pagination ?? ratingsRes.data.meta ?? {};
      const finalReviews = Array.isArray(reviews) ? reviews : [];
      setRatings(finalReviews);
      setPages(pagination.pages ?? pagination.totalPages ?? 1);
      if (typeof ratingsRes.data.canRate !== 'undefined') setCanRate(Boolean(ratingsRes.data.canRate));
      // detect if current user already has a review and prefill the form for updates
      try {
        if (user) {
          const my = finalReviews.find(r => r && r.user && (String(r.user._id || r.user.id) === String(user._id || user.id)));
          if (my) {
            setUserReview(my);
            setMyRating({ rating: Number(my.rating) || 0, text: my.text || '' });
          } else {
            setUserReview(null);
          }
        }
      } catch (e) { /* ignore */ }
    } catch (e) {
      console.error("Failed to load ratings", e);
      setError("Failed to load ratings");
    } finally {
      setLoading(false);
    }
  };

  // combined fetch on open / vendorId / page
  useEffect(() => {
    if (!isOpen) return;
    // clear local input when modal opens so previous draft is not preserved
    setMyRating({ rating: 0, text: '' });
    // initialize resolvedOrderId from prop when modal opens
    setResolvedOrderId(orderId || null);
    let mounted = true;

    (async () => {
      try {
        setError("");
        setLoading(true);
        // fetch vendor and ratings in parallel
        const [vendorRes, ratingsRes] = await Promise.allSettled([
          api.get(`/users/${vendorId}`),
          api.get(`/ratings`, {
            params: {
              entityType: "vendor",
              entityId: vendorId,
              page,
              pageSize: 5,
            },
          }),
        ]);

        if (!mounted) return;

        // vendor
        if (vendorRes.status === "fulfilled") {
          const v = vendorRes.value.data.user ?? vendorRes.value.data ?? null;
          setVendor(v);
        } else {
          console.warn("Vendor fetch failed", vendorRes.reason);
          setVendor(null);
        }

        // ratings
        if (ratingsRes.status === "fulfilled") {
          const data = ratingsRes.value.data;
          const reviews = data.reviews ?? data.items ?? data.data ?? [];
          const pagination = data.pagination ?? data.meta ?? {};
          const finalReviews = Array.isArray(reviews) ? reviews : [];
          setRatings(finalReviews);
          setPages(pagination.pages ?? pagination.totalPages ?? 1);
          if (typeof data.canRate !== 'undefined') setCanRate(Boolean(data.canRate));
          // backend may return an eligible order id for rating — use it to auto-fill submit
          if (!resolvedOrderId && data && data.canRateOrderId) setResolvedOrderId(data.canRateOrderId);
          // detect existing review by current user
          try {
            if (user) {
              const my = finalReviews.find(r => r && r.user && (String(r.user._id || r.user.id) === String(user._id || user.id)));
              if (my) {
                setUserReview(my);
                setMyRating({ rating: Number(my.rating) || 0, text: my.text || '' });
              } else {
                setUserReview(null);
              }
            }
          } catch (e) { /* ignore */ }
        } else {
          console.warn("Ratings fetch failed", ratingsRes.reason);
          setRatings([]);
          setPages(1);
        }
      } catch (e) {
        console.error(e);
        setError("Failed to load vendor information");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [isOpen, vendorId, page, API, orderId, resolvedOrderId, user]);

  // Submit a new rating
  const submitRating = async () => {
    setError("");
    // prefer resolvedOrderId (prop or backend-provided) when submitting
    const orderToUse = resolvedOrderId || orderId || null;
    if (!orderToUse) {
      setError(
        "Ratings are only allowed after an order completes. Please rate from the delivered order notification."
      );
      return;
    }
    if (!myRating.rating || myRating.rating < 1) {
      setError("Please provide a rating (1-5).");
      return;
    }

    try {
      setLoading(true);
      await api.post(`/ratings`, {
        entityType: "vendor",
        entityId: vendorId,
        rating: myRating.rating,
        text: myRating.text,
        orderId: orderToUse,
      });
      // clear local input and refresh ratings (go to first page)
      setMyRating({ rating: 0, text: "" });
      setPage(1);
      // explicitly fetch first page so UI updates even if page already was 1
      await fetchRatings(1);
    } catch (e) {
      console.error("Failed to submit rating", e);
      setError(e?.response?.data?.message || "Failed to submit rating");
    } finally {
      setLoading(false);
    }
  };

  // Remove current user's review for this vendor
  const removeRating = async () => {
    if (!userReview || !userReview._id) return;
    setError('');
    try {
      setLoading(true);
      await api.delete(`/ratings/${userReview._id}`);
      // refresh list
      setUserReview(null);
      setMyRating({ rating: 0, text: '' });
      setPage(1);
      await fetchRatings(1);
    } catch (e) {
      console.error('Failed to remove rating', e);
      setError(e?.response?.data?.message || 'Failed to remove rating');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={() => typeof onClose === "function" && onClose()}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 760 }}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <h2>Vendor</h2>
          <button
            className="modal-close"
            onClick={() => {
              setMyRating({ rating: 0, text: "" });
              typeof onClose === "function" && onClose();
            }}
            aria-label="Close"
          >
            <FiX size={20} />
          </button>
        </div>

        <div className="modal-body">
          {loading ? (
            <div style={{ textAlign: "center", padding: 24 }}>
              <LoadingSpinner />
            </div>
          ) : (
            <>
              <div>
                <div className="form-group" style={{ display: "flex", gap: 12, alignItems: 'center' }}>
                    <div
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: 8,
                      background: "var(--bg-light, #f4f4f4)",
                      overflow: "hidden",
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {vendor?.avatar ? (
                      <img
                        src={vendor.avatar && (vendor.avatar.startsWith('http') || vendor.avatar.startsWith('data:')) ? vendor.avatar : `${API}${vendor.avatar}`}
                        alt="vendor"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    ) : (
                      <div style={{ fontSize: 28 }}>🏪</div>
                    )}
                  </div>
                </div>

                <div className="details-grid" style={{ marginTop: 12 }}>
                  <div className="detail-item">
                    <div className="detail-content">
                      <span className="detail-label">Store Name</span>
                      <span className="detail-value">{vendor?.vendorProfile?.storeName || 'Not set'}</span>
                    </div>
                  </div>
                  <div className="detail-item">
                    <div className="detail-content">
                      <span className="detail-label">Location</span>
                      <span className="detail-value" style={{ width: '100%' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {formatStoreAddress(vendor?.vendorProfile?.storeAddress) || vendor?.address || 'Not set'}
                          </div>
                          {(vendor?.vendorProfile?.storeAddress || vendor?.address) ? (
                            <div style={{ flex: '0 0 auto' }}>
                              <button className="btn btn-icon" onClick={() => openMapsForAddress(vendor?.vendorProfile?.storeAddress ? formatStoreAddress(vendor?.vendorProfile?.storeAddress) : vendor?.address)} aria-label="Open in maps">
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </span>
                    </div>
                  </div>
                  <div className="detail-item">
                    <div className="detail-content">
                      <span className="detail-label">City / Country</span>
                      <span className="detail-value">{(vendor?.vendorProfile?.storeAddress && (vendor?.vendorProfile?.storeAddress.city || vendor?.vendorProfile?.storeAddress.country)) ? `${vendor?.vendorProfile?.storeAddress.city || ''} ${vendor?.vendorProfile?.storeAddress.country || ''}`.trim() : 'Not set'}</span>
                    </div>
                  </div>
                  <div className="detail-item">
                    <div className="detail-content">
                      <span className="detail-label">Description</span>
                      <span className="detail-value">{vendor?.vendorProfile?.description || 'Not set'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {error && (
                <div className="form-group" style={{ marginTop: 8 }}>
                  <div style={{ color: "var(--danger-color, #d32f2f)" }}>{error}</div>
                </div>
              )}

              <div style={{ height: 1, background: "var(--border-color)", margin: "16px 0" }} />

              <div className="form-group">
                <h4 style={{ margin: 0, marginBottom: 8 }}>{userReview ? 'Update rating' : 'Leave a rating'}</h4>
                {canRate === false && !userReview && (
                  <div className="verification-warning" style={{ marginTop: 8 }}>
                    <div className="warning-content">
                      <p className="warning-text" style={{ margin: 0 }}>Please purchase an item from this vendor to leave a rating. Only customers who bought and received the order can rate.</p>
                    </div>
                    <div>
                      <button className="verify-now-btn vendor-rate-cta" onClick={(e) => { e.stopPropagation(); navigate(`/store?vendor=${vendorId}`); }}>View store</button>
                    </div>
                  </div>
                )}
                {(canRate !== false || userReview) && (
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <StarRating value={myRating.rating} onChange={(v) => setMyRating((s) => ({ ...s, rating: v }))} interactive={true} size={22} />
                    <textarea placeholder="Leave a short comment (optional)" value={myRating.text} onChange={(e) => setMyRating((s) => ({ ...s, text: e.target.value }))} style={{ flex: 1, minHeight: 80 }} />
                  </div>
                )}
              </div>

              <div style={{ height: 1, background: "var(--border-color)", margin: "16px 0" }} />

              <div className="form-group">
                <h4 style={{ margin: 0, marginBottom: 8 }}>Ratings</h4>
                {ratings.length === 0 ? (
                  <p style={{ margin: 0 }}>No ratings yet</p>
                ) : (
                  <div>
                    {ratings.map((r) => (
                      <div key={r._id || r.id} style={{ borderBottom: "1px solid var(--border-color, #eee)", padding: "12px 0" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ fontWeight: 600 }}>{r.user?.displayName || r.user?.name || "User"}</div>
                          <div>
                            <StarRating value={r.rating} interactive={false} size={16} />
                          </div>
                        </div>
                        {r.text && <div style={{ marginTop: 8 }}>{r.text}</div>}
                        <div style={{ color: "var(--text-gray, #999)", fontSize: 12, marginTop: 8 }}>{(r.updatedAt || r.createdAt) ? new Date(r.updatedAt || r.createdAt).toLocaleString() : ""}</div>
                      </div>
                    ))}

                    <div style={{ marginTop: 12, display: "flex", justifyContent: 'center' }}>
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
              <button onClick={() => { setMyRating({ rating: 0, text: "" }); typeof onClose === "function" && onClose(); }} className="btn btn-cancel">
                Cancel
              </button>
              <button onClick={submitRating} className="btn btn-submit" disabled={loading}>
                {loading ? "Please wait..." : (userReview ? 'Update' : 'Submit')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

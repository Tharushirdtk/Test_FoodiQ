import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import productService from '../services/productService';
import favoritesService from '../services/favoritesService';
import { FiArrowLeft, FiHeart, FiStar, FiMinus, FiPlus, FiClock, FiCheck } from 'react-icons/fi';
import { AiFillHeart, AiFillStar } from 'react-icons/ai';
import '../styles/ProductPage.css';
import StarRating from '../components/StarRating';
import VendorModal from '../components/VendorModal';
import { useSocket } from '../context/SocketContext';
import Pagination from '../components/Pagination';
import '../styles/StarRating.css';
import api from '../utils/apiClient';

const ProductPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { addToCart } = useCart();
  const toast = useToast();
  const [quantity, setQuantity] = useState(1);
  const [selectedSize] = useState(null);
  const [spiceLevel] = useState(null);
  const [extras] = useState({
    extraCheese: false,
    grilledBacon: false,
    onionRings: false
  });
  // selectedAttributes is authoritative for attributes UI
  const [selectedAttributes, setSelectedAttributes] = useState([]);
  const [attributeGroupsFromProduct, setAttributeGroupsFromProduct] = useState([]);
  const [selectedInstructions] = useState([]);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [favoritesLoading, setFavoritesLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [skipNextRefresh, setSkipNextRefresh] = useState(false);
  const ignoreRefreshRef = useRef(false);
  const [showRateModal, setShowRateModal] = useState(false);
  const [ratingValue, setRatingValue] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [showVendorModal, setShowVendorModal] = useState(false);
  const { user, isGuest } = useAuth();
  const [userRating, setUserRating] = useState(null);
  const [productCanRate, setProductCanRate] = useState(null);

  // Reviews list and pagination
  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsPagination, setReviewsPagination] = useState({ page: 1, pages: 1, total: 0, perPage: 5 });
  const socket = useSocket();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [vendorAvatar, setVendorAvatar] = useState(null);
  const API = process.env.REACT_APP_API_URL || 'http://localhost:5000';

  // Check if product is in favorites
  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      setFavoritesLoading(true);
      if (ignoreRefreshRef.current) {
        console.log('[ProductPage] refresh ignored due to local toggle');
        return;
      }
      // Skip if this component just toggled favorite (avoid overwriting optimistic update)
      if (skipNextRefresh) {
        setSkipNextRefresh(false);
        return;
      }
      try {
        const favorites = await favoritesService.getFavorites();
        if (!mounted) return;
        const favList = favorites?.favorites || favorites || [];
        const isFav = favList.some(f => {
          const favProdId = f.product?._id || f.product?.id || f.productId || f._id;
          return favProdId === id;
        });
        setIsFavorite(isFav);
      } catch (err) {
        // Ignore - user might not be logged in
      } finally {
        if (mounted) setFavoritesLoading(false);
      }
    };

    refresh();
    favoritesService.onChange(refresh);
    return () => { mounted = false; favoritesService.offChange(refresh); };
  }, [id, skipNextRefresh]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await productService.getProduct(id);
        const p = data?.product || data || null;
        if (mounted) setProduct(p);
      } catch (err) {
        if (mounted) {
          setProduct(null);
          setError(err?.response?.data?.message || 'Failed to load product');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [id]);

  // initialize attribute groups and default selectedAttributes from product
  useEffect(() => {
    if (!product || !product.attributeGroups) {
      setAttributeGroupsFromProduct([]);
      return;
    }
    const ag = Array.isArray(product.attributeGroups) ? product.attributeGroups : [];
    setAttributeGroupsFromProduct(ag);

    // Build default selectedAttributes from product attributeGroups.
    // - For single-select: use explicit defaultSelected; fallback to first only when group is non-optional
    // - For multi-select: include every attribute with defaultSelected === true
    const defaults = [];
    for (const g of ag) {
      const groupKey = g.key || g.title || 'group';
      if (g.type === 'single-select') {
        let def = (g.attributes || []).find(a => a.defaultSelected) || null;
        if (!def && !g.optional) def = (g.attributes || [])[0] || null;
        if (def) {
          defaults.push({ groupKey, id: def._id || def.id || null, name: def.name, priceType: def.priceType || 'flat', amount: def.amount || 0, quantity: 1 });
        }
      } else if (g.type === 'multi-select') {
        for (const a of (g.attributes || [])) {
          if (a && a.defaultSelected) {
            defaults.push({ groupKey, id: a._id || a.id || null, name: a.name, priceType: a.priceType || 'flat', amount: a.amount || 0, quantity: a.quantityEnabled ? (a.defaultQuantity || 1) : 1 });
          }
        }
      }
    }
    setSelectedAttributes(prev => {
      // preserve any existing selections, but ensure defaults are added
      // Use id-based de-duplication so multi-select groups can have multiple defaults
      const res = [...(prev || [])];
      for (const d of defaults) {
        const existsById = res.find(r => String(r.id) === String(d.id));
        if (!existsById) res.push(d);
      }
      return res;
    });
  }, [product]);

  // Helpers for attribute selection UI
  const isAttrSelected = (attrId) => {
    return selectedAttributes.some(sa => String(sa.id) === String(attrId));
  };

  const handleSelectSingle = (groupKey, attr) => {
    setSelectedAttributes(prev => {
      const prevList = prev || [];
      const exists = prevList.find(p => p.groupKey === groupKey && String(p.id) === String(attr._id || attr.id));
      // find group metadata to check optional flag
      const group = (attributeGroupsFromProduct || []).find(g => ((g.key || g.title || '').toString() === (groupKey || '').toString()));
      const isOptional = !!(group && group.optional);
      if (exists && isOptional) {
        // toggle off: remove any selection from this group
        return prevList.filter(p => p.groupKey !== groupKey);
      }
      // otherwise select this attribute (replace existing selection for group)
      const withoutGroup = prevList.filter(p => p.groupKey !== groupKey);
      const entry = { groupKey, id: attr._id || attr.id, name: attr.name, priceType: attr.priceType || 'flat', amount: attr.amount || 0, quantity: 1 };
      return [...withoutGroup, entry];
    });
  };

  const handleToggleMulti = (groupKey, attr) => {
    setSelectedAttributes(prev => {
      const exists = (prev || []).find(p => String(p.id) === String(attr._id || attr.id));
      if (exists) return (prev || []).filter(p => String(p.id) !== String(attr._id || attr.id));
      const entry = { groupKey, id: attr._id || attr.id, name: attr.name, priceType: attr.priceType || 'flat', amount: attr.amount || 0, quantity: 1 };
      return [...(prev || []), entry];
    });
  };

  const updateSelectedAttributeQuantity = (attrId, qty) => {
    setSelectedAttributes(prev => (prev || []).map(p => String(p.id) === String(attrId) ? ({ ...p, quantity: Math.max(1, Number(qty) || 1) }) : p));
  };

  const computeAttributesPreview = () => {
    const prodPrice = Number(product?.price || 0);
    // compute size adjustments (flat and percent, including minus variants)
    let sizeFlatTotal = 0;
    let sizePercentTotal = 0;
    for (const s of (selectedAttributes || [])) {
      if (s.groupKey === 'size') {
        const pt = String(s.priceType || 'flat').toLowerCase();
        const amt = Number(s.amount || 0);
        const qty = Number(s.quantity || 1) || 1;
        if (pt === 'flat') sizeFlatTotal += amt * qty;
        else if (pt === 'minus-flat') sizeFlatTotal -= amt * qty;
        else if (pt === 'percent') sizePercentTotal += amt;
        else if (pt === 'minus-percent') sizePercentTotal -= amt;
      }
    }

    // apply flat adjustments first, then percent adjustments are applied against base product price
    let baseWithSize = Math.round((prodPrice + sizeFlatTotal) * 100) / 100;
    if (sizePercentTotal !== 0) {
      baseWithSize = Math.round((prodPrice + sizeFlatTotal + (prodPrice * (sizePercentTotal / 100))) * 100) / 100;
    }

    let attributesTotal = 0;
    for (const s of (selectedAttributes || [])) {
      if (s.groupKey === 'size') continue;
      const qty = Number(s.quantity || 1) || 1;
      const pt = String(s.priceType || 'flat').toLowerCase();
      const amt = Number(s.amount || 0);
      if (pt === 'percent' || pt === 'minus-percent') {
        const sign = pt === 'minus-percent' ? -1 : 1;
        const computed = Math.round((baseWithSize * (amt / 100)) * 100) / 100;
        attributesTotal += computed * qty * sign;
      } else {
        const sign = pt === 'minus-flat' ? -1 : 1;
        attributesTotal += (Math.round(amt * 100) / 100) * qty * sign;
      }
    }
    attributesTotal = Math.round(attributesTotal * 100) / 100;
    return { baseWithSize, attributesTotal };
  };

  const formatAttributeLabel = (a, qty = 1) => {
    const pt = String(a.priceType || 'flat').toLowerCase();
    const amt = Number(a.amount || 0);
    // compute monetary amount for percent types using current baseWithSize
    const { baseWithSize } = computeAttributesPreview();
    let unit = 0;
    if (pt === 'percent' || pt === 'minus-percent') {
      unit = Math.round((baseWithSize * (amt / 100)) * 100) / 100;
      if (pt === 'minus-percent') unit = -unit;
    } else {
      unit = Math.round(amt * 100) / 100;
      if (pt === 'minus-flat') unit = -unit;
    }
    const total = Math.round(unit * Number(qty || 1) * 100) / 100;
    return `${total >= 0 ? '+\u00A0Rs\u00A0' + total.toFixed(2) : '-\u00A0Rs\u00A0' + Math.abs(total).toFixed(2)}`;
  };

  // Compute display price for a size attribute: base product price plus/minus this attribute
  const computeSizeDisplayPrice = (a) => {
    const prodPrice = Number(product?.price || 0);
    const pt = String(a.priceType || 'flat').toLowerCase();
    const amt = Number(a.amount || 0);
    let result = prodPrice;
    if (pt === 'flat') result = prodPrice + amt;
    else if (pt === 'minus-flat') result = prodPrice - amt;
    else if (pt === 'percent') result = prodPrice + (prodPrice * (amt / 100));
    else if (pt === 'minus-percent') result = prodPrice - (prodPrice * (amt / 100));
    return `Rs ${(Math.round(result * 100) / 100).toFixed(2)}`;
  };

  // Return numeric addon amount for an attribute relative to the base product price
  const computeAttributeAddon = (a) => {
    // Use baseWithSize so percent calculations consider selected size adjustments
    const base = computeAttributesPreview().baseWithSize || Number(product?.price || 0);
    const pt = String(a.priceType || 'flat').toLowerCase();
    const amt = Number(a.amount || 0);
    let addon = 0;
    if (pt === 'percent') addon = base * (amt / 100);
    else if (pt === 'minus-percent') addon = - (base * (amt / 100));
    else if (pt === 'minus-flat') addon = -amt;
    else addon = amt;
    return Math.round(addon * 100) / 100;
  };

  // fetch canRate for product so we can gate the rating CTA
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await api.get(`/ratings`, { params: { entityType: 'product', entityId: id } });
        if (!mounted) return;
        setProductCanRate(typeof res.data.canRate !== 'undefined' ? Boolean(res.data.canRate) : false);
      } catch (e) {
        if (mounted) setProductCanRate(false);
      }
    })();
    return () => { mounted = false; };
  }, [id]);

  // auto-open rate modal if URL requests it (e.g., from notification links)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search || '');
      if (params.get('openRate')) {
        // If orderId provided, prefill via query (ProductPage handles submission using productService)
        const oid = params.get('orderId');
        if (oid) {
          // store in local state so submitReview can use if needed
          // We don't currently wire submitReview to accept external orderId, but opening the modal helps user
        }
        setShowRateModal(true);
      }
    } catch (e) { /* ignore */ }
  }, []);

  // load vendor avatar if vendor info isn't embedded in product
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!product || !product.vendor) {
          if (mounted) setVendorAvatar(null);
          return;
        }
        // vendor may be populated object or id string
        if (typeof product.vendor === 'object') {
          const a = product.vendor.avatar || product.vendor.avatarUrl || product.vendor.avatar_url || null;
          const url = a ? (a.startsWith('http') || a.startsWith('data:') ? a : `${API}${a}`) : null;
          if (mounted) setVendorAvatar(url);
          return;
        }
        // fetch vendor
        const vid = product.vendor;
        const resp = await api.get(`/users/${vid}`);
        const user = resp.data.user || resp.data;
        const ua = user?.avatar || null;
        const uurl = ua ? (ua.startsWith('http') || ua.startsWith('data:') ? ua : `${API}${ua}`) : null;
        if (mounted) setVendorAvatar(uurl);
      } catch (e) {
        if (mounted) setVendorAvatar(null);
      }
    })();
    return () => { mounted = false; };
  }, [product, API]);

  // Load current user's review (if any)
  useEffect(() => {
    let mounted = true;
    const loadMyReview = async () => {
      if (!user) {
        if (mounted) setUserRating(null);
        return;
      }
      try {
        const res = await productService.getReviews(id);
        const reviews = res?.reviews || res || [];
        const my = reviews.find(r => r.user && (r.user._id === user._id || r.user.id === user._id));
        if (mounted) setUserRating(my || null);
      } catch (e) {
        // ignore
      }
    };
    loadMyReview();
    return () => { mounted = false; };
  }, [id, user]);

  // Load product reviews (list) with pagination
  const loadReviews = useCallback(async (page = 1) => {
    setReviewsLoading(true);
    try {
      const opts = { page, limit: reviewsPagination.perPage };
      const res = await productService.getReviews(id, opts);
      const revs = res?.reviews || res || [];
      const pag = res?.pagination || { page: page, pages: 1, total: revs.length, perPage: reviewsPagination.perPage };
      setReviews(revs);
      setReviewsPagination({ page: pag.page || page, pages: pag.pages || 1, total: pag.total || revs.length, perPage: pag.perPage || reviewsPagination.perPage });
    } catch (e) {
      console.error('Failed to load reviews', e);
      setReviews([]);
    } finally {
      setReviewsLoading(false);
    }
  }, [id, reviewsPagination.perPage]);

  useEffect(() => {
    let mounted = true;
    if (!id) return;
    (async () => {
      if (!mounted) return;
      await loadReviews(1);
    })();
    return () => { mounted = false; };
  }, [id, loadReviews]);

  // Listen for real-time review events and refresh when this product is affected
  useEffect(() => {
    if (!socket || !socket.on) return;
    const offSaved = socket.on('productReviewSaved', (payload) => {
      try {
        const pid = payload && (payload.productId || payload.product || payload.productId?.toString());
        if (!pid) return;
        if (String(pid) === String(id)) {
          // reload current page of reviews
          loadReviews(reviewsPagination.page || 1);
        }
      } catch (e) {}
    });
    const offUpdated = socket.on('productReviewsUpdated', (payload) => {
      try {
        const pid = payload && payload.productId;
        if (String(pid) === String(id)) {
          loadReviews(reviewsPagination.page || 1);
        }
      } catch (e) {}
    });
    return () => {
      try { offSaved && offSaved(); } catch (e) {}
      try { offUpdated && offUpdated(); } catch (e) {}
    };
  }, [socket, id, reviewsPagination.page, loadReviews]);

  // Join products room so this client receives product-level review events
  useEffect(() => {
    if (!socket) return;
    try {
      socket.joinProducts && socket.joinProducts();
    } catch (e) {}
    return () => {
      try { socket.leaveProducts && socket.leaveProducts(); } catch (e) {}
    };
  }, [socket]);

  const sizes = [
    { name: 'Regular', price: 0 },
    { name: 'Large', price: 2 }
  ];

  // spiceLevels removed — product now uses `attributeGroups` for spice/size handling

  const extrasOptions = [
    { id: 'extraCheese', name: 'Extra Cheese', price: 1.50 },
    { id: 'grilledBacon', name: 'Grilled Bacon', price: 2.00 },
    { id: 'onionRings', name: 'Onion Rings', price: 1.00 }
  ];

  const handleToggleFavorite = async () => {
    if (favoriteLoading) return;
    if (isGuest) {
      navigate('/login');
      return;
    }
    setFavoriteLoading(true);
    
    // Capture current state before toggling
    const wasAlreadyFavorite = isFavorite;
    console.log('[ProductPage] handleToggleFavorite start', { productId: id, wasAlreadyFavorite });
    
    // Optimistic UI update - immediately flip the heart
    // Mark to ignore refreshes triggered by the global favorites change
    ignoreRefreshRef.current = true;
    console.log('[ProductPage] ignoreRefreshRef set true');
    setIsFavorite(!wasAlreadyFavorite);
    // Skip the next refresh triggered by notifyFavoritesChange to preserve optimistic state
    setSkipNextRefresh(true);
    
    try {
      if (wasAlreadyFavorite) {
        // Remove from favorites
        console.log('[ProductPage] calling favoritesService.removeFavorite', id);
        await favoritesService.removeFavorite(id);
        console.log('[ProductPage] removeFavorite completed', id);
      } else {
        // Add to favorites
        console.log('[ProductPage] calling favoritesService.addFavorite', id);
        await favoritesService.addFavorite(id);
        console.log('[ProductPage] addFavorite completed', id);
      }
    } catch (err) {
      console.error('[ProductPage] Failed to toggle favorite:', err);
      // Revert optimistic update on failure
      setIsFavorite(wasAlreadyFavorite);
      setSkipNextRefresh(false);
    } finally {
      setFavoriteLoading(false);
      console.log('[ProductPage] handleToggleFavorite end', { productId: id, isFavorite });
      // Temporarily ignore any incoming favorites refreshes to prevent flicker
      setTimeout(() => {
        ignoreRefreshRef.current = false;
        console.log('[ProductPage] ignoreRefreshRef set false');
      }, 700);
    }
  };

  const handleAddToCart = () => {
    if (!product) return;
    if (isGuest) {
      navigate('/login');
      return;
    }
    // Validate requiredMin for non-optional multi-select groups
    try {
      const groups = Array.isArray(product.attributeGroups) ? product.attributeGroups : [];
      const sel = selectedAttributes || [];
      for (const g of groups) {
        if (g && g.type === 'multi-select' && !g.optional) {
          const rm = Number.isFinite(Number(g.requiredMin)) ? Number(g.requiredMin) : 0;
          if (Number.isInteger(rm) && rm > 0) {
            const groupKey = (g.key || g.title || '').toString().toLowerCase();
            const selCount = sel.filter(s => (s.groupKey || '').toString().toLowerCase() === groupKey).length;
            if (selCount < rm) {
              const msg = `Please select ${rm} option${rm > 1 ? 's' : ''} for ${g.title || g.key}.`;
              if (toast && typeof toast.showToast === 'function') toast.showToast(msg, { type: 'error' });
              return;
            }
          }
        }
      }
    } catch (e) {
      // swallow validation errors and proceed
    }
    // Build `selectedAttributes` payload to send to backend.
    // Priority: explicit `selectedAttributes` state from UI; otherwise derive from product.attributeGroups defaults.
    let attrs = [];
    const selectedExtras = extrasOptions.filter(extra => extras[extra.id]);
    const sizePrice = sizes.find(s => s.name === selectedSize)?.price || 0;

    if (selectedAttributes && selectedAttributes.length > 0) {
      attrs = selectedAttributes.map(a => ({ ...a }));
    } else {
      // Derive from product defaults (do not auto-select optional group's first option)
      const ags = Array.isArray(product?.attributeGroups) ? product.attributeGroups : [];
      for (const g of ags) {
        const groupKey = g.key || g.title || '';
        if (g.type === 'single-select') {
          const def = (g.attributes || []).find(a => a.defaultSelected);
          if (def) {
            attrs.push({ groupKey, id: def._id || def.id, name: def.name, priceType: def.priceType || 'flat', amount: def.amount || 0, quantity: 1 });
          }
        } else if (g.type === 'multi-select') {
          for (const a of (g.attributes || [])) {
            if (a && a.defaultSelected) {
              attrs.push({ groupKey, id: a._id || a.id, name: a.name, priceType: a.priceType || 'flat', amount: a.amount || 0, quantity: a.quantityEnabled ? (a.defaultQuantity || 1) : 1 });
            }
          }
        }
      }

      // Always include explicit size and extras selections if not already present
      // include size as single-select attribute if not present
      const hasSize = attrs.some(x => (x.groupKey || '').toString().toLowerCase() === 'size');
      if (!hasSize && selectedSize) attrs.unshift({ groupKey: 'size', name: selectedSize, priceType: 'flat', amount: sizePrice, quantity: 1 });
      // include extras
      for (const ex of selectedExtras) {
        const exists = attrs.find(a => (a.name || '').toString() === ex.name.toString());
        if (!exists) attrs.push({ groupKey: 'extras', name: ex.name, priceType: 'flat', amount: ex.price, quantity: 1 });
      }
    }

    const baseUnitPrice = (product?.price || 0) + sizePrice + selectedExtras.reduce((sum, e) => sum + e.price, 0);

    addToCart({
      id: product?._id || product?.id || product?.productId || id,
      name: product?.name || 'Product',
      price: baseUnitPrice,
      image: product?.image || '',
      selectedAttributes: attrs,
      size: selectedSize,
      spiceLevel,
      extras: selectedExtras.map(e => ({ name: e.name, price: e.price })),
      instructions: selectedInstructions,
      quantity
    });

    // Show global toast and navigate shortly after
    if (toast && typeof toast.showToast === 'function') {
      toast.showToast('Added to cart', { type: 'success', duration: 2400 });
    }
    setAdding(true);
    setTimeout(() => {
      setAdding(false);
      // Navigate back to the store page. Do NOT set vendor filter when coming from Add-to-Cart.
      // (Rating modal still uses vendor selection elsewhere; keep that behavior unchanged.)
      navigate('/store');
    }, 800);
  };

  const [submittingReview, setSubmittingReview] = useState(false);

  const handleSubmitReview = async () => {
    if (submittingReview) return;
    setSubmittingReview(true);
    try {
      const created = await productService.addReview(id, { rating: ratingValue, text: reviewText });
      
      // Refresh product data to get updated aggregates
      const data = await productService.getProduct(id);
      const p = data?.product || data || null;
      setProduct(p);
      // Refresh user's review
      try {
        const revRes = await productService.getReviews(id);
        const revs = revRes?.reviews || revRes || [];
        const my = revs.find(r => r.user && (r.user._id === user?._id || r.user.id === user?._id));
        setUserRating(my || (created || null));
      } catch (e) {
        setUserRating(created || null);
      }
      setShowRateModal(false);
      setReviewText('');
      setRatingValue(0);
      if (toast && typeof toast.showToast === 'function') {
        toast.showToast('Review submitted', { type: 'success' });
      }
    } catch (err) {
      console.error('Failed to submit review', err);
      if (toast && typeof toast.showToast === 'function') {
        toast.showToast(err?.response?.data?.message || 'Failed to submit review', { type: 'error' });
      }
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleClearRating = async () => {
    if (!userRating || !userRating._id) return;
    try {
      setSubmittingReview(true);
      await productService.deleteReview(id, userRating._id);
      // refresh product and user's review
      const data = await productService.getProduct(id);
      const p = data?.product || data || null;
      setProduct(p);
      setUserRating(null);
      setRatingValue(0);
      setReviewText('');
      if (toast && typeof toast.showToast === 'function') {
        toast.showToast('Rating removed', { type: 'success' });
      }
    } catch (err) {
      console.error('Failed to clear rating', err);
      if (toast && typeof toast.showToast === 'function') {
        toast.showToast('Failed to remove rating', { type: 'error' });
      }
    } finally {
      setSubmittingReview(false);
      setShowRateModal(false);
    }
  };

  const openRateModal = () => {
    const existing = userRating;
    if (existing && typeof existing.rating !== 'undefined') {
      setRatingValue(Number(existing.rating));
      setReviewText(existing.text || '');
    } else {
      setRatingValue(0);
      setReviewText('');
    }
    setShowRateModal(true);
  };

  const calculateTotal = () => {
    const { baseWithSize, attributesTotal } = computeAttributesPreview();
    const unit = baseWithSize + attributesTotal;
    return (Math.round(unit * 100) / 100 * quantity).toFixed(2);
  };

  const getCategoryLabel = (category) => {
    const labels = {
      'appetizer': 'Appetizer',
      'main': 'Main Course',
      'dessert': 'Dessert',
      'beverage': 'Beverage'
    };
    return labels[category] || category;
  };

  // Loading State
  if (loading) {
    return (
      <div className="product-page">
        <header className="product-header">
          <button className="btn btn-icon" onClick={() => navigate(-1)}>
            <FiArrowLeft size={24} />
          </button>
        </header>
        <div className="product-loading">
          <div className="loading-spinner"></div>
          <p>Loading product...</p>
        </div>
      </div>
    );
  }

  // Error State
  if (error || !product) {
    return (
      <div className="product-page">
        <header className="product-header">
          <button className="btn btn-icon" onClick={() => navigate(-1)}>
            <FiArrowLeft size={24} />
          </button>
        </header>
        <div className="product-error">
          <div className="error-icon">😕</div>
          <h2>Product Not Found</h2>
          <p>{error || "The product you're looking for doesn't exist or has been removed."}</p>
          <button className="btn btn-primary" onClick={() => navigate('/store')}>
            Browse Menu
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="product-page">
      {/* Header */}
      <header className="product-header">
        <button className="btn btn-icon" onClick={() => navigate(-1)}>
          <FiArrowLeft size={24} />
        </button>
        <h1 className="header-title">{product.name}</h1>
        <div className="header-actions">
          {(productCanRate === true || userRating) && (
            <button
              className={`star-header-btn ${userRating ? 'active' : ''}`}
              onClick={openRateModal}
              aria-label="Rate product"
              title={productCanRate === false ? 'You can only rate this product after completing a delivered order that included it.' : ''}
            >
              {userRating ? <AiFillStar size={20} /> : <FiStar size={20} />}
            </button>
          )}
          <button 
            className={`btn btn-icon ${isFavorite ? 'favorite active' : ''}`}
            onClick={handleToggleFavorite}
            disabled={favoriteLoading || favoritesLoading || loading}
            aria-pressed={isFavorite}
            title={favoritesLoading ? 'Loading favorite state...' : ''}
          >
            {isFavorite ? <AiFillHeart size={20} color="#e74c3c" /> : <FiHeart size={20} />}
          </button>
        </div>
      </header>

      {/* Product Image */}
      <div className="product-image-section">
        {product.image ? (
          <img 
            src={product.image} 
            alt={product.name} 
            className="product-image"
          />
        ) : (
          <div className="product-image-placeholder">
            <span>🍽️</span>
          </div>
        )}
        {!product.available && (
          <div className="unavailable-badge">Currently Unavailable</div>
        )}
      </div>

      {/* Product Info */}
      <div className="product-content">
        {/* Basic Info */}
        <div className="product-info-section">
          <div className="category-row">
            <span className="product-category">{getCategoryLabel(product.category)}</span>
            {product && product.vendor && (
              <button className="vendor-avatar-btn" onClick={() => setShowVendorModal(true)} aria-label="View vendor">
                {vendorAvatar ? (
                  <img className="vendor-avatar-img" src={vendorAvatar} alt="vendor" />
                ) : (
                  <div className="vendor-avatar-fallback">🏪</div>
                )}
              </button>
            )}
          </div>
          <h1 className="product-name">{product.name}</h1>
          
          <div className="product-meta">
            <div className="product-rating">
                <span className="rating-count">({product.reviewCount || 0} reviews)</span>
              </div>
            <div className="product-time">
              <FiClock size={14} />
              <span>15-20 min</span>
            </div>
          </div>
          
          <p className="product-description">{product.description}</p>
          
          <div className="product-price-section">
            <span className="product-price">Rs {product.price?.toFixed(2)}</span>
          </div>
        </div>

        {/* Attribute Groups (dynamic) */}
        {(attributeGroupsFromProduct || []).map((g) => {
          const groupKey = (g.key || g.title || '').toString();
          const groupKeyNorm = groupKey.toLowerCase();
          const isSizeGroup = groupKeyNorm === 'size' || groupKeyNorm === 'sizes';
          return (
            <div className="options-section" key={groupKey}>
              <h3>{g.title || g.key} {g.optional ? <span className="optional-label">(Optional)</span> : null}</h3>

              {g.type === 'single-select' ? (
                isSizeGroup ? (
                  <div className="size-options">
                      {(g.attributes || []).map((a) => (
                      <button
                        key={String(a._id || a.id || a.name)}
                        className={`size-btn ${isAttrSelected(a._id || a.id) ? 'active' : ''}`}
                        onClick={() => handleSelectSingle(groupKey, a)}
                      >
                        <div className="size-name">{a.name}</div>
                        <div className="size-price">{computeSizeDisplayPrice(a)}</div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="choice-options">
                    {(g.attributes || []).map((a) => {
                      const addon = computeAttributeAddon(a);
                      return (
                        <button
                          key={String(a._id || a.id || a.name)}
                          className={`choice-btn ${isAttrSelected(a._id || a.id) ? 'active' : ''}`}
                          onClick={() => handleSelectSingle(groupKey, a)}
                        >
                          <span>{a.name}</span>
                          {addon !== 0 && <span className="choice-price">{formatAttributeLabel(a)}</span>}
                        </button>
                      );
                    })}
                  </div>
                )
              ) : (
                <div className="multi-options">
                    {(g.attributes || []).map((a) => {
                          const sel = selectedAttributes.find(s => String(s.id) === String(a._id || a.id));
                          const addon = computeAttributeAddon(a);
                          return (
                            <div
                              key={String(a._id || a.id)}
                              className={`multi-item ${sel ? 'selected' : ''}`}
                              role="button"
                              tabIndex={0}
                              onClick={() => handleToggleMulti(groupKey, a)}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleToggleMulti(groupKey, a); } }}
                            >
                              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                                <input type="checkbox" checked={!!sel} onChange={(e) => { e.stopPropagation(); handleToggleMulti(groupKey, a); }} />
                                <span>{a.name}</span>
                              </label>

                              {a.quantityEnabled && sel && (
                                <div style={{ marginLeft: 12 }} onClick={(e) => e.stopPropagation()}>
                                  <input type="number" min={1} value={sel.quantity || 1} onClick={(e) => e.stopPropagation()} onChange={(e) => updateSelectedAttributeQuantity(sel.id, e.target.value)} style={{ width: 64 }} />
                                </div>
                              )}

                              <div style={{ marginLeft: 12 }}>
                                {addon !== 0 && <span className="choice-price">{formatAttributeLabel(a, sel ? (sel.quantity || 1) : 1)}</span>}
                              </div>
                            </div>
                          );
                        })}
                </div>
              )}
            </div>
          );
        })}

        
        {/* Reviews Section */}
        <div className="reviews-section">
          <h3>Ratings</h3>
          <div className="reviews-summary" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span className="rating-count">({product?.reviewCount || 0} ratings)</span>
          </div>

          {reviewsLoading ? (
            <p>Loading reviews...</p>
          ) : (
            <div className="reviews-list">
              {reviews.length === 0 ? (
                <p className="muted">No reviews yet. Be the first to review this product.</p>
              ) : (
                reviews.map(r => (
                  <div key={r._id || r.id} className="review-item" style={{ borderBottom: '1px solid var(--border-color, #eee)', padding: '12px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ fontWeight: 600 }}>{(r.user && (r.user.name || r.user.displayName)) || 'Anonymous'}</div>
                      <StarRating value={Number(r.rating || 0)} interactive={false} size={14} />
                      <div style={{ marginLeft: 'auto', color: 'var(--text-gray, #666)', fontSize: 12 }}>{new Date(r.updatedAt || r.createdAt).toLocaleString()}</div>
                    </div>
                    {r.text && <p style={{ marginTop: 8 }}>{r.text}</p>}
                  </div>
                ))
              )}
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <Pagination page={reviewsPagination.page} pages={reviewsPagination.pages} onChange={(p) => loadReviews(p)} />
          </div>
        </div>

      </div>

      {/* Bottom Action Bar */}
      <div className="bottom-action-bar">
        <div className="quantity-control">
          <button 
            className="btn btn-icon qty-btn"
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            disabled={quantity <= 1}
          >
            <FiMinus size={20} />
          </button>
          <span className="quantity">{quantity}</span>
          <button 
            className="btn btn-icon qty-btn"
            onClick={() => setQuantity(quantity + 1)}
          >
            <FiPlus size={20} />
          </button>
        </div>
        <button 
          className="btn btn-primary add-to-cart-btn" 
          onClick={handleAddToCart}
          disabled={!product.available || adding}
        >
          {adding ? (
            <><FiCheck size={20} /> Added to Cart!</>
          ) : (
            product.available ? `Add to Cart • Rs ${calculateTotal()}` : 'Unavailable'
          )}
        </button>
      </div>

      {/* Rate Modal */}
      {showRateModal && (
        <div className="modal-overlay" onClick={() => setShowRateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Rate {product.name}</h3>
            </div>
            <div className="modal-body">
              <div className="star-picker">
                <StarRating value={ratingValue} onChange={setRatingValue} interactive={true} size={28} />
              </div>
              <textarea
                className="review-textarea"
                placeholder="Write a quick review (optional)"
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                rows={4}
              />
            </div>
            <div className="modal-footer">
              <div style={{ display: 'flex', gap: 12, width: '100%', justifyContent: 'space-between' }}>
                <div>
                  {userRating && (
                    <button className="btn btn-outline" onClick={handleClearRating} disabled={submittingReview}>
                      {submittingReview ? 'Removing...' : 'Remove Rating'}
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button className="btn" onClick={() => setShowRateModal(false)} disabled={submittingReview}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleSubmitReview} disabled={submittingReview}>
                    {submittingReview ? 'Submitting...' : 'Submit'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <VendorModal vendorId={product?.vendor} isOpen={showVendorModal} onClose={() => setShowVendorModal(false)} />

      {/* local toast removed; using global toast */}
    </div>
  );
};

export default ProductPage;

import React, { createContext, useContext, useState, useEffect } from 'react';
import cartService from '../services/cartService';
import { useSocket } from './SocketContext';
import ToastContext from './ToastContext';

const CartContext = createContext();

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};

export const CartProvider = ({ children }) => {
  const [cartItems, setCartItems] = useState([]);
  const [deliveryAddress, setDeliveryAddress] = useState({
    type: 'House',
    address: '1865 Vineyard Drive',
    city: 'Colombo, Sri Lanka'
  });
  const { emitWithAck, on, socket } = useSocket();
  const [loading, setLoading] = useState(true);
  const toastCtx = useContext(ToastContext);
  const toast = toastCtx || { showToast: () => {}, removeToast: () => {} };

  // Helper: normalize backend item shape and selectedAttributes
  const mapBackendItem = (it) => {
    console.log('[mapBackendItem] input item:', it);
    const product = it.product || it.productId || {};
    const attributeGroups = product.attributeGroups || it.options?.attributeGroups || [];

    // Build lookup of attributes by id/name to infer groupKey when missing
    const flatAttrsById = {};
    attributeGroups.forEach((g) => {
      (g.attributes || []).forEach((a) => {
        const key = String(a._id || a.id || a.name);
        flatAttrsById[key] = {
          groupKey: g.key || g.title || '',
          name: a.name,
          priceType: a.priceType || 'flat',
          amount: a.amount || 0
        };
      });
    });

    // Merge root `selectedAttributes` and `options.selectedAttributes`.
    // Prefer values in `options.selectedAttributes` (authoritative client choice),
    // but fall back to root `selectedAttributes` when missing.
    const rootSel = Array.isArray(it.selectedAttributes) ? it.selectedAttributes : [];
    const optSel = (it.options && Array.isArray(it.options.selectedAttributes)) ? it.options.selectedAttributes : [];
    const combinedMap = new Map();
    // add root selections first, then overwrite with options selections when present
    rootSel.forEach((s) => {
      const idVal = s.id || s._id || s.attributeId || s.attribute || s.name;
      combinedMap.set(String(idVal), s);
    });
    optSel.forEach((s) => {
      const idVal = s.id || s._id || s.attributeId || s.attribute || s.name;
      combinedMap.set(String(idVal), s);
    });
    const selectedRaw = Array.from(combinedMap.values());

    const selected = (selectedRaw || []).map((s) => {
      const idVal = s.id || s._id || s.attributeId || s.attribute || s.name;
      const id = String(idVal);
      const found = flatAttrsById[id] || {};
      return {
        groupKey: s.groupKey || s.group || found.groupKey || '',
        id,
        name: s.name || found.name || '',
        priceType: s.priceType || found.priceType || 'flat',
        amount: typeof s.amount !== 'undefined' ? s.amount : (found.amount || 0),
        quantity: s.quantity || 1,
        computedAmount: typeof s.computedAmount !== 'undefined' ? s.computedAmount : undefined
      };
    });

    // Deduplicate selections for single-select groups
    const singleGroups = attributeGroups.filter(g => g.type === 'single-select').map(g => (g.key || g.title || '').toString().toLowerCase());
    const deduped = [];
    selected.forEach((sel) => {
      const gk = (sel.groupKey || '').toString().toLowerCase();
      if (singleGroups.includes(gk)) {
        if (!deduped.some(d => (d.groupKey || '').toString().toLowerCase() === gk)) {
          deduped.push(sel);
        }
      } else {
        deduped.push(sel);
      }
    });

    // compute attributes total if not provided by backend
    const computeAttributesTotal = (basePrice, sels) => {
      const base = Number(basePrice || 0);
      if (!Array.isArray(sels) || sels.length === 0) return 0;
      // find size selection (affects base) but do NOT include it in attributesTotal
      const sizeSel = sels.find(s => /size/i.test(String(s.groupKey || '')));
      let sizeAddon = 0;
      if (sizeSel) {
        const pt = String(sizeSel.priceType || 'flat').toLowerCase();
        const amt = Number(sizeSel.amount || 0);
        if (pt === 'flat') sizeAddon = amt;
        else if (pt === 'minus-flat') sizeAddon = -amt;
        else if (pt === 'percent') sizeAddon = base * (amt / 100);
        else if (pt === 'minus-percent') sizeAddon = - (base * (amt / 100));
      }
      const baseWithSize = Math.round((base + sizeAddon) * 100) / 100;
      let total = 0; // attributesTotal should exclude size; size is applied to base price
      for (const s of sels) {
        // skip size since already counted
        if (sizeSel && String(s.id) === String(sizeSel.id)) continue;
        const qty = Number(s.quantity || 1);
        const pt = String(s.priceType || 'flat').toLowerCase();
        const amt = Number(s.amount || 0);
        let addon = 0;
        if (pt === 'percent') addon = baseWithSize * (amt / 100) * qty;
        else if (pt === 'minus-percent') addon = - (baseWithSize * (amt / 100) * qty);
        else if (pt === 'minus-flat') addon = - (amt * qty);
        else addon = amt * qty;
        total += addon;
      }
      return Math.round(total * 100) / 100;
    };

    // Compute size addon so we can apply it to the stored base price (size should not be part of attributesTotal)
    const basePrice = Number(product.price ?? it.price) || 0;
    const sizeSel = (deduped || []).find(s => /size/i.test(String(s.groupKey || '')));
    let sizeAddon = 0;
    if (sizeSel) {
      const pt = String(sizeSel.priceType || 'flat').toLowerCase();
      const amt = Number(sizeSel.amount || 0);
      if (pt === 'flat') sizeAddon = amt;
      else if (pt === 'minus-flat') sizeAddon = -amt;
      else if (pt === 'percent') sizeAddon = basePrice * (amt / 100);
      else if (pt === 'minus-percent') sizeAddon = - (basePrice * (amt / 100));
    }
    const finalPrice = Math.round((basePrice + sizeAddon) * 100) / 100;

    const mapped = {
      id: product._id || product.id || it._id || it.id,
      cartItemId: it._id || it.id,
      productId: product._id || product.id,
      name: product.name || it.name,
      price: finalPrice,
      image: product.image || it.image || '',
      quantity: it.quantity || it.qty || 1,
      description: product.description || it.description || '',
      options: it.options || { size: null, spiceLevel: null, extras: [], instructions: '' },
      selectedAttributes: deduped,
      attributesTotal: (typeof it.attributesTotal !== 'undefined' ? it.attributesTotal : (typeof it.options?.attributesTotal !== 'undefined' ? it.options.attributesTotal : computeAttributesTotal(basePrice, deduped))),
      attributeGroups: attributeGroups
    };
    console.log('[mapBackendItem] mapped item attributesTotal:', mapped.attributesTotal, 'finalPrice:', mapped.price);
    return mapped;
  };

  const addToCart = (item) => {
    console.log('[addToCart] called with item:', item);
    // Build sanitized options: only persist `selectedAttributes` to match server behavior
    let options = {};
    if (Array.isArray(item.selectedAttributes) && item.selectedAttributes.length > 0) {
      options.selectedAttributes = item.selectedAttributes;
    } else if (item.options && Array.isArray(item.options.selectedAttributes) && item.options.selectedAttributes.length > 0) {
      options.selectedAttributes = item.options.selectedAttributes;
    }

    const quantity = item.quantity || 1;

    // optimistic local update with temporary cartItemId to keep React keys unique
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setCartItems((prevItems) => {
      // Check if item with same id AND same options (including selectedAttributes) exists
      const existingItem = prevItems.find((i) =>
        i.id === item.id &&
        JSON.stringify(i.options) === JSON.stringify(options)
      );
      if (existingItem) {
        return prevItems.map((i) =>
          i.id === item.id && JSON.stringify(i.options) === JSON.stringify(options)
            ? { ...i, quantity: i.quantity + quantity }
            : i
        );
      }
      return [...prevItems, { ...item, quantity, options, selectedAttributes: item.selectedAttributes || options.selectedAttributes, cartItemId: tempId }];
    });

    // sync with backend via socket (ack) and capture returned cart item id
    (async () => {
      try {
        const productId = item.id;
        let res = null;
        // Ensure we send selectedAttributes at root as well as inside options for compatibility
        const rootSelected = item.selectedAttributes || options.selectedAttributes || [];
        if (emitWithAck) {
          try {
            res = await emitWithAck('addToCart', { productId, quantity, options, selectedAttributes: rootSelected });
          } catch (e) {
            // fallback to http
            res = await cartService.addToCart(productId, quantity, options, rootSelected);
          }
        } else {
          res = await cartService.addToCart(productId, quantity, options, rootSelected);
        }

        const created = res?.item || res?.cartItem || (Array.isArray(res) ? res[0] : null) || res;
        if (created) {
          console.log('[addToCart] server created response:', created);
          // Map server item to our frontend shape (includes computed attributesTotal)
          const mappedCreated = mapBackendItem(created);
          console.log('[addToCart] mappedCreated:', mappedCreated);
          setCartItems((prev) => {
            const foundIndex = prev.findIndex((i) => (
              (i.cartItemId && String(i.cartItemId).startsWith('temp-') && JSON.stringify(i.options) === JSON.stringify(options)) ||
              (i.id === item.id && JSON.stringify(i.options) === JSON.stringify(options))
            ));
            if (foundIndex !== -1) {
              // replace optimistic entry with authoritative mapped item
              const copy = prev.slice();
              copy[foundIndex] = mappedCreated;
              return copy;
            }
            // If we couldn't find the optimistic item, append the server item
            return [...prev, mappedCreated];
          });
        }
      } catch (err) {
        // ignore
      }
    })();
  };

  const removeFromCart = (itemId) => {
    // Resolve backend id before updating local state
    const found = cartItems.find((it) => it.id === itemId || it.cartItemId === itemId);
    const backendId = found?.cartItemId || itemId;

    setCartItems((prevItems) => prevItems.filter((item) => (item.id !== itemId && item.cartItemId !== itemId)));

    (async () => {
      try {
        if (emitWithAck) {
          try { await emitWithAck('removeCartItem', { itemId: backendId }); }
          catch (e) { await cartService.removeFromCart(backendId); }
        } else {
          await cartService.removeFromCart(backendId);
        }
      } catch (e) {}
    })();
  };

  const updateQuantity = (itemId, quantity) => {
    if (quantity <= 0) {
      removeFromCart(itemId);
      return;
    }
    // Resolve backend id before updating local state
    const found = cartItems.find((it) => it.id === itemId || it.cartItemId === itemId);
    const backendId = found?.cartItemId || itemId;

    setCartItems((prevItems) =>
      prevItems.map((item) =>
        (item.id === itemId || item.cartItemId === itemId) ? { ...item, quantity } : item
      )
    );

    (async () => {
      try {
        if (emitWithAck) {
          try { await emitWithAck('updateCartItem', { itemId: backendId, quantity }); }
          catch (e) { await cartService.updateCartItem(backendId, quantity); }
        } else {
          await cartService.updateCartItem(backendId, quantity);
        }
      } catch (e) {}
    })();
  };

  const updateItemAttributes = (itemId, selectedAttributes, options = null) => {
    console.log('[updateItemAttributes] called for itemId:', itemId, 'selectedAttributes:', selectedAttributes, 'options:', options);
    // Resolve backend id before updating local state
    const found = cartItems.find((it) => it.id === itemId || it.cartItemId === itemId);
    const backendId = found?.cartItemId || itemId;

    // optimistic update: set selectedAttributes locally while waiting for server
    const optimisticOptions = options || { ...(found?.options || {}), selectedAttributes };
    setCartItems((prevItems) => prevItems.map((item) =>
      (item.id === itemId || item.cartItemId === itemId) ? { ...item, selectedAttributes, options: optimisticOptions } : item
    ));

    (async () => {
      try {
        // prefer sending selected attributes inside `options` to avoid duplicate roots
        const optsToSend = optimisticOptions;
        if (emitWithAck) {
          try { await emitWithAck('updateCartItem', { itemId: backendId, options: optsToSend }); }
          catch (e) { await cartService.updateCartItem(backendId, undefined, optsToSend); }
        } else {
          await cartService.updateCartItem(backendId, undefined, optsToSend);
        }

        // refresh cart item from backend to get authoritative snapshot
        try {
          const data = await cartService.getCart();
          const items = Array.isArray(data) ? data : data.items || [];
          console.log('[updateItemAttributes] refreshCart received items:', items);
          const mapped = items.map(mapBackendItem);
          console.log('[updateItemAttributes] mapped items after refresh:', mapped);
          setCartItems(mapped);
          if (toast && typeof toast.showToast === 'function') {
            toast.showToast('Saved attributes', { type: 'success', duration: 2000 });
          }

          // Notify other clients via socket that cart item was upserted
          try {
            const updated = mapped.find(it => String(it.cartItemId) === String(backendId));
            console.log('[updateItemAttributes] found updated item for socket emit:', updated);
            if (socket && updated) {
              try { socket.emit('cartUpdate', { action: 'upsert', item: updated }); } catch (e) { /* ignore */ }
            }
          } catch (e) { /* ignore */ }
        } catch (e) {
          // ignore refresh error
          console.warn('[updateItemAttributes] refresh failed', e && e.message);
          if (toast && typeof toast.showToast === 'function') {
            toast.showToast('Attributes saved but refresh failed', { type: 'success', duration: 2000 });
          }
        }
      } catch (e) {
        // show error and attempt to restore authoritative state
        if (toast && typeof toast.showToast === 'function') {
          const msg = (e && e.message) ? e.message : 'Failed to save attributes';
          toast.showToast(msg, { type: 'error', duration: 3000 });
        }
        try {
          const data = await cartService.getCart();
          const items = Array.isArray(data) ? data : data.items || [];
          const mapped = items.map(mapBackendItem);
          setCartItems(mapped);
        } catch (err) {
          // ignore
        }
      }
    })();
  };

  const clearCart = () => {
    setCartItems([]);
    (async () => {
      try {
        if (emitWithAck) {
          try { await emitWithAck('clearCart'); }
          catch (e) { await cartService.clearCart(); }
        } else {
          await cartService.clearCart();
        }
      } catch (e) {}
    })();
  };

  // Load cart from backend on mount (always use HTTP GET to ensure authoritative data)
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const data = await cartService.getCart();
        if (!mounted || !data) return;
        // data may be an array of items or { items: [...] }
        const items = Array.isArray(data) ? data : data.items || [];
        const mapped = items.map(mapBackendItem);
        setCartItems(mapped);
      } catch (err) {
        // ignore load errors
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Exposed helper to refresh cart from server
  const refreshCart = async () => {
    setLoading(true);
    try {
      const data = await cartService.getCart();
          const items = Array.isArray(data) ? data : data.items || [];
          const mapped = items.map(mapBackendItem);
          setCartItems(mapped);
    } catch (err) {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  // Listen for cart updates from socket and reconcile local state
  useEffect(() => {
    if (!on) return;
    const off = on('cartUpdate', (payload) => {
      try {
        if (!payload || !payload.action) return;
        if (payload.action === 'clear') {
          setCartItems([]);
          return;
        }
        if (payload.action === 'remove' && payload.itemId) {
          setCartItems((prev) => prev.filter((it) => (it.cartItemId !== payload.itemId && it.id !== payload.itemId)));
          return;
        }
        if (payload.action === 'upsert' && payload.item) {
          const mapped = mapBackendItem(payload.item);
          setCartItems((prev) => {
            const exists = prev.some((p) => (
              (p.cartItemId && mapped.cartItemId && p.cartItemId === mapped.cartItemId) ||
              (p.id === mapped.id && JSON.stringify(p.options) === JSON.stringify(mapped.options))
            ));
            if (exists) {
              return prev.map((p) => (
                (p.cartItemId && mapped.cartItemId && p.cartItemId === mapped.cartItemId) ||
                (p.id === mapped.id && JSON.stringify(p.options) === JSON.stringify(mapped.options))
                  ? { ...p, ...mapped }
                  : p
              ));
            }
            return [...prev, mapped];
          });
          return;
        }
      } catch (e) {
        // ignore
      }
    });
    return () => { try { off && off(); } catch (e) {} };
  }, [on]);

  const getCartTotal = () => {
    return cartItems.reduce((total, item) => {
      const attr = Number(item.attributesTotal || 0);
      const base = Number(item.price || 0);
      return total + (base + attr) * (Number(item.quantity) || 1);
    }, 0);
  };

  const getCartCount = () => {
    return cartItems.reduce((count, item) => count + item.quantity, 0);
  };

  return (
    <CartContext.Provider
      value={{
        cartItems,
        loading,
        addToCart,
        removeFromCart,
        updateQuantity,
        updateItemAttributes,
        clearCart,
        getCartTotal,
        getCartCount,
        deliveryAddress,
        setDeliveryAddress,
        refreshCart
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

const Order = require('../models/Order');
const CartItem = require('../models/CartItem');
const Address = require('../models/Address');
const Product = require('../models/Product');
const User = require('../models/User');
const Driver = require('../models/Driver');
const { sendOrderReceiptEmail } = require('../utils/mailer');
const Notification = require('../models/Notification');

// Helper: emit realtime aggregated counts to relevant rooms
const emitRealtimeCounts = async (app, order) => {
  try {
    const io = app && app.get && app.get('io');
    if (!io) return;
    // Driver: available unassigned ready_for_pickup orders
    try {
      const availableCount = await Order.countDocuments({ driver: { $in: [null, undefined] }, status: 'ready_for_pickup', serviceType: { $ne: 'pickup' } });
      io.to('drivers').emit('driverCounts', { available: availableCount });
    } catch (e) { console.warn('emitRealtimeCounts: driver count failed', e && e.message); }

    // Vendor: for each vendor in this order, emit their current active order count
    try {
      if (order && Array.isArray(order.items) && order.items.length > 0) {
        const vendorIds = Array.from(new Set(order.items.map(i => i && i.vendor).filter(Boolean).map(String)));
        for (const vid of vendorIds) {
          try {
            const vendorOrderCount = await Order.countDocuments({ 'items.vendor': vid, status: { $in: ['order_confirmed', 'preparing_your_meal', 'ready_for_pickup'] } });
            // emit to vendor user room
            io.to(`user:${vid}`).emit('vendorCounts', { orders: vendorOrderCount });
          } catch (e) { console.warn('emitRealtimeCounts: vendor count failed for', vid, e && e.message); }
        }
      }
    } catch (e) { console.warn('emitRealtimeCounts: vendor loop failed', e && e.message); }

    // Admin/support: emit a lightweight admin stats update (order count)
    try {
      const orderCount = await Order.countDocuments();
      io.to('supporters').emit('adminStats', { orderCount });
    } catch (e) { console.warn('emitRealtimeCounts: admin stats failed', e && e.message); }
  } catch (e) {
    console.warn('emitRealtimeCounts general error', e && e.message);
  }
};

// Create order implementation using centralized totals util
exports.createOrder = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });

    const { addressId, payment, items: providedItems } = req.body;

    // Determine items: use provided items or the user's cart
    let cartItems = [];
    if (Array.isArray(providedItems) && providedItems.length > 0) {
      for (const it of providedItems) {
        const prod = await Product.findById(it.productId || it.productId || it.productId || it.productId);
        // allow missing product lookup (fallback to provided price)
        cartItems.push({ product: it.productId || it.product || null, name: it.name || (prod && prod.name), price: Number(it.price || (prod && prod.price) || 0), quantity: Number(it.quantity) || 1, options: it.options || {} });
      }
    } else {
      const dbCart = await CartItem.find({ user: userId }).populate('product');
      if (!dbCart || dbCart.length === 0) return res.status(400).json({ message: 'Cart is empty' });
      cartItems = dbCart.map(ci => ({ product: ci.product && ci.product._id ? ci.product._id : (ci.product || null), name: ci.product && ci.product.name ? ci.product.name : ci.name, price: Number((ci.product && ci.product.price) || ci.price || 0), quantity: ci.quantity, options: ci.options || {} }));
    }

    // Resolve address
    let addressObj = null;
    if (addressId) {
      const addr = await Address.findById(addressId);
      if (!addr) return res.status(404).json({ message: 'Address not found' });
      if (addr.user.toString() !== userId.toString()) return res.status(403).json({ message: 'Forbidden' });
      addressObj = { type: addr.type, street: addr.street, city: addr.city, zip: addr.zip };
    } else if (req.body.address) {
      const a = req.body.address;
      const zip = a.zip || a.postalCode;
      if (!a.street || !a.city || !zip) return res.status(400).json({ message: 'Address incomplete' });
      addressObj = { type: a.type || a.label || 'Home', street: a.street, city: a.city, zip: zip };
    } else {
      return res.status(400).json({ message: 'Address is required' });
    }

    // Attach vendor ids to cart items where possible
    const cartItemsWithVendor = [];
    for (const it of cartItems) {
      let vendorId = it.vendor || null;
      if (!vendorId && it.product) {
        try {
          const prod = await Product.findById(it.product).select('vendor');
          if (prod && prod.vendor) vendorId = prod.vendor;
        } catch (e) { /* ignore */ }
      }
      cartItemsWithVendor.push({ ...it, vendor: vendorId });
    }

    // Derive promo info
    let promo = null;
    if (req.body.promoPercent && Number(req.body.promoPercent)) {
      promo = { type: 'percent', amount: Number(req.body.promoPercent) };
    } else if (req.body.promoAmount && Number(req.body.promoAmount)) {
      promo = { type: 'flat', amount: Number(req.body.promoAmount) };
    } else if (req.body.appliedVoucher && req.body.appliedVoucher.amount) {
      const av = req.body.appliedVoucher;
      promo = { type: av.discountType === 'percent' ? 'percent' : 'flat', amount: Number(av.amount || 0) };
    }

    // Compute attribute snapshots per item (size adjustments apply to base price and are NOT double-counted in attributesTotal)
    const computeAttributeSnapshotsForOrder = (productDoc, selectedArr) => {
      const prod = productDoc || {};
      const groups = prod.attributeGroups || [];
      const attrMap = new Map();
      for (const g of groups) {
        const key = g.key || '';
        for (const a of (g.attributes || [])) {
          if (a && a._id) attrMap.set(String(a._id), { groupKey: key, def: a });
        }
      }

      let sizeFlatSum = 0;
      let sizePercentDelta = 0;
      for (const s of selectedArr) {
        const sid = String(s.id || s._id || s.id);
        const entry = attrMap.get(sid);
        if (!entry || entry.groupKey !== 'size' || !entry.def) continue;
        const def = entry.def;
        const qty = Number(s.quantity || 1) || 1;
        const dpt = String(def.priceType || 'flat').toLowerCase();
        if (dpt === 'flat') {
          sizeFlatSum += (Number(def.amount || 0) * qty);
        } else if (dpt === 'minus-flat') {
          sizeFlatSum -= (Number(def.amount || 0) * qty);
        } else if (dpt === 'percent') {
          sizePercentDelta += (Number(def.amount || 0) / 100) * (Number(prod.price || 0));
        } else if (dpt === 'minus-percent') {
          sizePercentDelta -= (Number(def.amount || 0) / 100) * (Number(prod.price || 0));
        }
      }
      const productBasePrice = Number(prod.price || 0);
      const baseWithSize = Math.round((productBasePrice + sizeFlatSum + sizePercentDelta) * 100) / 100;

      const snapshots = [];
      let attributesTotal = 0;
      for (const s of selectedArr) {
        const sid = String(s.id || s._id || s.id);
        const entry = attrMap.get(sid);
        let name = s.name || '';
        let priceType = s.priceType || 'flat';
        let amount = Number(s.amount || 0);
        const qty = Number(s.quantity || 1) || 1;
        if (entry && entry.def) {
          name = name || entry.def.name || name;
          priceType = entry.def.priceType || priceType;
          amount = (typeof entry.def.amount !== 'undefined') ? Number(entry.def.amount) : amount;
        }

        const isSize = entry && entry.groupKey === 'size';
        let computed = 0;
        if (isSize) {
          computed = 0; // size contributed via baseWithSize
        } else if (priceType === 'percent') {
          computed = Math.round((baseWithSize * (amount / 100)) * 100) / 100;
          computed = computed * qty;
        } else if (priceType === 'minus-percent') {
          computed = Math.round((baseWithSize * (amount / 100)) * 100) / 100;
          computed = -computed * qty;
        } else if (priceType === 'minus-flat') {
          computed = - (Math.round((amount) * 100) / 100) * qty;
        } else {
          computed = Math.round((amount) * 100) / 100;
          computed = computed * qty;
        }
        computed = Math.round(computed * 100) / 100;
        snapshots.push({ id: sid, name, priceType, amount, quantity: qty, computedAmount: computed });
        attributesTotal += computed;
      }
      attributesTotal = Math.round(attributesTotal * 100) / 100;
      return { snapshots, attributesTotal, productBasePrice: baseWithSize };
    };

    // Enrich cart items with attribute snapshots and compute per-item base price (including size)
    for (let idx = 0; idx < cartItemsWithVendor.length; idx++) {
      const it = cartItemsWithVendor[idx];
      let prodDoc = null;
      try {
        if (it.product) prodDoc = await Product.findById(it.product).select('price attributeGroups');
      } catch (e) { prodDoc = null; }
      const selected = (it.options && it.options.selectedAttributes) || it.selectedAttributes || [];
      const { snapshots, attributesTotal, productBasePrice } = computeAttributeSnapshotsForOrder(prodDoc, Array.isArray(selected) ? selected : []);
      // set item's price to base price including size adjustments
      it.price = productBasePrice || Number(it.price || 0);
      it.selectedAttributes = snapshots;
      it.attributesTotal = attributesTotal;
      cartItemsWithVendor[idx] = it;
    }

    // Compute totals using item price that includes attributesTotal (subtotal should include attributes)
    const { computeOrderTotals } = require('../utils/orderTotals');
    const itemsForTotals = cartItemsWithVendor.map(it => ({ ...it, price: (Number(it.price || 0) + Number(it.attributesTotal || 0)) }));
    const totals = await computeOrderTotals(itemsForTotals, promo, { salesTax: req.body.salesTax });

    // Build per-item vendorRevenue using vendorCuts proportionally
    const itemsWithVendor = [];
    const vendorSubtotalMap = {};
    for (const it of cartItemsWithVendor) {
      const itemSubtotal = (Number(it.price || 0) + Number(it.attributesTotal || 0)) * (it.quantity || 1);
      const vid = it.vendor ? String(it.vendor) : '_unknown';
      vendorSubtotalMap[vid] = (vendorSubtotalMap[vid] || 0) + itemSubtotal;
    }
    for (const it of cartItemsWithVendor) {
      const itemSubtotal = (Number(it.price || 0) + Number(it.attributesTotal || 0)) * (it.quantity || 1);
      const vid = it.vendor ? String(it.vendor) : '_unknown';
      const vendorInfo = totals.vendorCuts[vid] || { vendorSubtotal: 0, vendorCut: 0 };
      const vendorSubtotal = vendorInfo.vendorSubtotal || vendorSubtotalMap[vid] || 0;
      const vendorCut = vendorInfo.vendorCut || 0;
      const itemVendorRevenue = vendorSubtotal > 0 ? Math.round((itemSubtotal / vendorSubtotal) * vendorCut * 100) / 100 : 0;
      itemsWithVendor.push({ ...it, vendor: it.vendor, vendorRevenue: itemVendorRevenue });
    }

    const paymentMethodVal = (payment && payment.method) || req.body.paymentMethod || (req.body.payment && req.body.payment.method) || req.body.method || 'unknown';
    const paymentCardIdVal = (payment && payment.cardId) || req.body.paymentCardId || (req.body.payment && req.body.payment.cardId) || req.body.cardId || null;

    const orderPayload = {
      user: userId,
      items: itemsWithVendor,
      address: addressObj,
      vendorAddresses: Array.isArray(req.body.vendorAddresses) && req.body.vendorAddresses.length > 0 ? req.body.vendorAddresses : (req.body.vendorAddress ? [req.body.vendorAddress] : []),
      subtotal: totals.subtotal,
      deliveryFee: totals.deliveryFee,
      salesTax: totals.salesTax,
      platformFee: totals.platformFee,
      promoAmount: totals.promoAmount,
      promoCode: req.body.promoCode || (req.body.appliedVoucher && req.body.appliedVoucher.code) || '',
      appliedVoucher: req.body.appliedVoucher || null,
      promoPercent: totals.promoPercent || 0,
      total: totals.customerPayAmount,
      driverRevenue: totals.driverCut,
      driverPlatformCut: totals.driverPlatformCut,
      platformCut: totals.platformCut,
      payment: { method: paymentMethodVal, cardId: paymentCardIdVal, status: 'created' },
      deliveryNote: req.body.deliveryNote || '',
      serviceType: req.body.serviceType || 'delivery',
      status: 'order_confirmed'
    };

    const order = await Order.create(orderPayload);

    // Emit socket update to owner and order room
    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`user:${userId}`).emit('orderUpdate', { action: 'create', orderId: order._id, order });
        io.to(`order:${order._id}`).emit('orderUpdate', { action: 'create', orderId: order._id, order });
      }
    } catch (e) { console.warn('Socket emit failed', e); }

    // Emit realtime aggregated counts (drivers/vendors/admin) asynchronously
    try {
      await emitRealtimeCounts(req.app, order);
    } catch (e) { console.warn('emitRealtimeCounts after create failed', e && e.message); }

    // Persist notification for user
    try {
      const note = await Notification.create({
        user: userId,
        title: `Order ${order._id?.toString().slice(-6).toUpperCase()} confirmed`,
        body: `Your order has been placed and confirmed.`,
        data: { orderId: order._id, type: 'order_created' }
      });
      try {
        const io2 = req.app.get('io');
        if (io2) io2.to(`user:${userId}`).emit('notification', note);
      } catch (e) { /* ignore socket notify failure */ }
    } catch (e) { console.warn('Failed to create notification', e.message); }

    // Notify vendors that an order including their items was confirmed
    try {
      const io3 = req.app.get('io');
      const vendorIds = new Set();
      if (order.vendorAddresses && order.vendorAddresses.length > 0) order.vendorAddresses.forEach(a => { if (a && a.vendor) vendorIds.add(String(a.vendor)); });
      if (order.vendorAddress && order.vendorAddress.vendor) vendorIds.add(String(order.vendorAddress.vendor));
      if ((vendorIds.size === 0) && Array.isArray(order.items)) order.items.forEach(it => { if (it && it.vendor) vendorIds.add(String(it.vendor)); });
      for (const vid of Array.from(vendorIds)) {
        try {
          const vnote = await Notification.create({ user: vid, title: `New order received`, body: `An order including your items was confirmed.`, data: { orderId: order._id, type: 'order_confirmed', vendor: vid } });
          try { if (io3) io3.to(`user:${vid}`).emit('notification', vnote); } catch (e) {}
        } catch (e) { console.warn('order create: vendor notification failed for', vid, e && e.message); }
      }
    } catch (e) { console.warn('order create: vendor notification loop failed', e && e.message); }

    return res.status(201).json({ orderId: order._id, order });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/orders - list user's orders (drivers get assigned orders)
exports.getOrders = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });

    // Support and admin users should be able to view all orders
    if (req.user.role === 'support' || req.user.role === 'admin') {
      const orders = await Order.find({}).sort({ createdAt: -1 });
      // prevent caching for this endpoint responses to avoid stale 304 responses in some clients
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(orders);
    }

    // regular customers get only their own orders
    if (req.user.role !== 'driver') {
      // Vendors: return orders that include items for this vendor
      if (req.user.role === 'vendor') {
        try {
          const vendorOrders = await Order.find({ 'items.vendor': userId }).sort({ createdAt: -1 });
          return res.status(200).json(vendorOrders);
        } catch (e) {
          console.warn('Failed to fetch vendor orders', e && e.message);
          return res.status(200).json([]);
        }
      }
      const orders = await Order.find({ user: userId }).sort({ createdAt: -1 });
      return res.status(200).json(orders);
    }

    // drivers: return assigned orders (by Driver doc or by user.driverProfile.assignedOrders)
    const results = [];
    // if frontend specifically requests only assigned orders, return only orders where driver == this driver
    try {
      if (req.query && (req.query.assignedOnly === 'true' || req.query.onlyAssigned === 'true')) {
        // resolve driverDoc and also honor any assignedOrders listed on user's driverProfile
        let driverDoc = null;
        if (req.user && req.user._id) driverDoc = await Driver.findOne({ user: req.user._id });
        if (!driverDoc && req.user.phone) driverDoc = await Driver.findOne({ phone: req.user.phone });
        if (!driverDoc && req.user.displayName) driverDoc = await Driver.findOne({ name: req.user.displayName });

        // collect assigned order ids from user profile if present
        const profileAssignedIds = Array.isArray(req.user?.driverProfile?.assignedOrders) ? req.user.driverProfile.assignedOrders : [];

        if (driverDoc || (profileAssignedIds && profileAssignedIds.length > 0)) {
          const orClause = [];
          if (driverDoc) orClause.push({ driver: driverDoc._id });
          if (profileAssignedIds && profileAssignedIds.length > 0) orClause.push({ _id: { $in: profileAssignedIds } });

          const assignedOnly = await Order.find({ $or: orClause }).sort({ createdAt: -1 });
          // If there are assigned orders, return them. If none, fall through so drivers without
          // assignments still see available `ready_for_pickup` orders instead of an empty array.
          if (assignedOnly && assignedOnly.length > 0) {
            res.setHeader('Cache-Control', 'no-store');
            return res.status(200).json(assignedOnly);
          }
          // else fall through to normal behaviour
        }
        // if neither driverDoc nor profile-assigned orders found, fall through to normal behaviour
      }
    } catch (e) {
      console.warn('Failed to serve assignedOnly request', e && e.message);
    }
    try {
      // try to find matching Driver document by phone or name
      let driverDoc = null;
      // Prefer Driver linked to this authenticated user
      if (req.user && req.user._id) driverDoc = await Driver.findOne({ user: req.user._id });
      if (!driverDoc && req.user.phone) driverDoc = await Driver.findOne({ phone: req.user.phone });
      if (!driverDoc && req.user.displayName) driverDoc = await Driver.findOne({ name: req.user.displayName });

      if (driverDoc) {
        const assigned = await Order.find({ driver: driverDoc._id }).sort({ createdAt: -1 });
        results.push(...assigned);
      }

      // also include orders referenced in user.driverProfile.assignedOrders
      if (req.user.driverProfile && Array.isArray(req.user.driverProfile.assignedOrders) && req.user.driverProfile.assignedOrders.length > 0) {
        const byProfile = await Order.find({ _id: { $in: req.user.driverProfile.assignedOrders } }).sort({ createdAt: -1 });
        results.push(...byProfile);
      }
    } catch (e) {
      console.warn('Failed to resolve driver orders', e.message);
    }

    // de-dupe by id
    const uniq = [];
    const seen = new Set();
    for (const o of results) {
      const id = o._id.toString();
      if (!seen.has(id)) { seen.add(id); uniq.push(o); }
    }

    // If driver has an active assigned order, return only assigned active orders
    try {
      let driverDoc = null;
      // Prefer Driver linked to this authenticated user
      if (req.user && req.user._id) driverDoc = await Driver.findOne({ user: req.user._id });
      if (!driverDoc && req.user.phone) driverDoc = await Driver.findOne({ phone: req.user.phone });
      if (!driverDoc && req.user.displayName) driverDoc = await Driver.findOne({ name: req.user.displayName });
      if (driverDoc || (req.user.driverProfile && Array.isArray(req.user.driverProfile.assignedOrders) && req.user.driverProfile.assignedOrders.length > 0)) {
        // Determine whether driver has any assigned orders that are NOT in terminal states (cancelled/delivered).
        const profileAssignedIds = Array.isArray(req.user.driverProfile?.assignedOrders) ? req.user.driverProfile.assignedOrders : [];
        const orClauseForAssigned = [];
        if (driverDoc) orClauseForAssigned.push({ driver: driverDoc._id });
        if (profileAssignedIds && profileAssignedIds.length > 0) orClauseForAssigned.push({ _id: { $in: profileAssignedIds } });

        if (orClauseForAssigned.length > 0) {
          // Find assigned orders for this driver/profile that are still open (not cancelled/delivered)
          const assignedOpen = await Order.find({ $and: [ { $or: orClauseForAssigned }, { status: { $nin: ['cancelled', 'delivered', 'picked_up_my_order'] } } ] }).sort({ createdAt: -1 });
          if (assignedOpen && assignedOpen.length > 0) {
            // If driver has any open assigned orders, return those only (do not include ready_for_pickup available orders)
            return res.status(200).json(assignedOpen);
          }
        }
      }

      // Driver has no open assigned orders — include unassigned orders that are READY so drivers see pickup-ready orders
      const available = await Order.find({ driver: { $in: [null, undefined] }, status: 'ready_for_pickup', serviceType: { $ne: 'pickup' } }).sort({ createdAt: 1 });
      for (const a of available) {
        const id = a._id.toString();
        if (!seen.has(id)) { seen.add(id); uniq.push(a); }
      }
    } catch (e) { console.warn('Failed to fetch available orders', e && e.message); }

    return res.status(200).json(uniq);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/orders/available - list unassigned orders ready for pickup (for drivers)
exports.getAvailableOrders = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });
    // Only drivers/support/admin should call this
    // Return unassigned orders that are ready for pickup
    const available = await Order.find({ driver: { $in: [null, undefined] }, status: 'ready_for_pickup', serviceType: { $ne: 'pickup' } }).sort({ createdAt: 1 });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(available);
  } catch (e) {
    console.error('getAvailableOrders error', e && e.message);
    return res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/orders/driver/history - return all orders that were assigned to this driver (optionally filter by status)
exports.getDriverHistory = async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ message: 'Not authorized' });
    // Resolve Driver doc for this user
    let driverDoc = null;
    try {
      if (user && user._id) driverDoc = await Driver.findOne({ user: user._id });
      if (!driverDoc && user.phone) driverDoc = await Driver.findOne({ phone: user.phone });
      if (!driverDoc && user.displayName) driverDoc = await Driver.findOne({ name: user.displayName });
    } catch (e) { /* ignore */ }
    if (!driverDoc) return res.status(400).json({ message: 'Driver profile not found' });

    const filter = { driver: driverDoc._id };
    if (req.query && req.query.status) filter.status = req.query.status;

    const orders = await Order.find(filter).sort({ createdAt: -1 });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(orders);
  } catch (e) {
    console.error('getDriverHistory error', e && e.message);
    return res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/orders/:id - get order details
exports.getOrder = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });

    // Debug logging: who is requesting and which order
    try { console.log('[getOrder] request by user:', req.user && { id: req.user._id && req.user._id.toString(), role: req.user.role }, 'orderId:', req.params.id); } catch (e) {}

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    try {
      const itemVendors = (order.items || []).map(i => (i && i.vendor) ? (i.vendor._id ? i.vendor._id.toString() : i.vendor.toString()) : null);
      const addrVendors = (order.vendorAddresses || []).map(a => (a && a.vendor) ? (a.vendor._id ? a.vendor._id.toString() : a.vendor.toString()) : null);
      console.log('[getOrder] order vendors items:', itemVendors, 'vendorAddresses:', addrVendors);
    } catch (e) {}
    // allow owner - return populated order so frontend chat navigator has user/driver/vendor details
    if (order.user.toString() === userId.toString()) {
      const populated = await Order.findById(req.params.id)
        .populate('driver', 'name phone avatar')
        .populate('user', 'displayName name avatar paymentMethods')
        .populate('vendorAddresses.vendor', 'displayName name avatar vendorProfile.storeName vendorProfile.storeAddress')
        .populate('items.vendor', 'displayName name avatar vendorProfile.storeName vendorProfile.storeAddress');

      // If order.payment.cardId references a user's embedded paymentMethods, attach that object
      try {
        if (populated && populated.payment && populated.payment.cardId && populated.user) {
          const userDoc = populated.user.paymentMethods ? populated.user : await User.findById(populated.user._id).select('paymentMethods');
          if (userDoc && Array.isArray(userDoc.paymentMethods)) {
            const pm = userDoc.paymentMethods.find(pm => String(pm._id) === String(populated.payment.cardId));
            if (pm) populated.payment.cardId = pm;
          }
        }
      } catch (e) { /* ignore */ }

      return res.status(200).json(populated);
    }

    // Drivers: allow viewing unassigned orders (so they can assign) or orders assigned to them
    if (req.user.role === 'driver') {
      try {
        let driverDoc = null;
        // Prefer Driver linked to this authenticated user (consistent with getOrders/assignOrder)
        if (req.user && req.user._id) {
          try { driverDoc = await Driver.findOne({ user: req.user._id }); } catch (ee) { /* ignore */ }
        }
        // Fallback: match by phone or display name
        if (!driverDoc) {
          if (req.user.phone) driverDoc = await Driver.findOne({ phone: req.user.phone });
          if (!driverDoc && req.user.displayName) driverDoc = await Driver.findOne({ name: req.user.displayName });
        }

        const assignedInProfile = req.user.driverProfile && Array.isArray(req.user.driverProfile.assignedOrders) && req.user.driverProfile.assignedOrders.some(a => a.toString() === order._id.toString());
        const assignedToDriver = driverDoc && order.driver && order.driver.toString() === driverDoc._id.toString();
        // allow if order is unassigned or assigned to this driver (or referenced in profile)
        if (!order.driver || assignedInProfile || assignedToDriver) {
          // fetch populated order for response
          const populated = await Order.findById(req.params.id)
            .populate('driver', 'name phone avatar')
            .populate('user', 'displayName name avatar paymentMethods')
            .populate('items.vendor', 'displayName name avatar vendorProfile.storeName vendorProfile.storeAddress');

          try {
            if (populated && populated.payment && populated.payment.cardId && populated.user) {
              const userDoc = populated.user.paymentMethods ? populated.user : await User.findById(populated.user._id).select('paymentMethods');
              if (userDoc && Array.isArray(userDoc.paymentMethods)) {
                const pm = userDoc.paymentMethods.find(pm => String(pm._id) === String(populated.payment.cardId));
                if (pm) populated.payment.cardId = pm;
              }
            }
          } catch (e) { /* ignore */ }

          return res.status(200).json(populated);
        }
      } catch (e) { /* ignore resolution errors */ }
    }

    // For non-driver (or drivers not permitted), still check owner/admin/vendor
    // Vendors: allow if at least one item or vendorAddress references this vendor user id
    if (req.user.role === 'vendor') {
      try {
        const vid = req.user._id && req.user._id.toString();
        const itemMatch = order.items && order.items.some(it => it.vendor && it.vendor.toString() === vid);
        const addrMatch = Array.isArray(order.vendorAddresses) && order.vendorAddresses.some(va => va && va.vendor && va.vendor.toString() === vid);
        if (itemMatch || addrMatch) {
          const populated = await Order.findById(req.params.id)
            .populate('driver', 'name phone avatar')
            .populate('user', 'displayName name avatar paymentMethods')
            .populate('vendorAddresses.vendor', 'displayName name avatar vendorProfile.storeName vendorProfile.storeAddress')
            .populate('items.vendor', 'displayName name avatar vendorProfile.storeName vendorProfile.storeAddress');

          try {
            if (populated && populated.payment && populated.payment.cardId && populated.user) {
              const userDoc = populated.user.paymentMethods ? populated.user : await User.findById(populated.user._id).select('paymentMethods');
              if (userDoc && Array.isArray(userDoc.paymentMethods)) {
                const pm = userDoc.paymentMethods.find(pm => String(pm._id) === String(populated.payment.cardId));
                if (pm) populated.payment.cardId = pm;
              }
            }
          } catch (e) { /* ignore */ }

          return res.status(200).json(populated);
        }
      } catch (e) { /* ignore and fall through to 403 */ }
    }

    return res.status(403).json({ message: 'Forbidden' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Export orders as CSV for authenticated users.
// Admin: may export all (and pass vendorId to filter).
// Vendor: exports orders related to their vendor id (items.vendor or vendorAddresses)
// Driver: exports orders assigned to the driver.
exports.exportOrdersCsv = async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ message: 'Not authorized' });

    const { from, to, vendorId } = req.query;
    const filter = {};

    // Date range
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    // Role-specific filtering
    if (user.role === 'admin' || user.role === 'support') {
      // admin/support can optionally filter by vendorId
      if (vendorId) {
        filter.$or = [ { 'items.vendor': vendorId }, { 'vendorAddresses.vendor': vendorId }, { 'vendorAddress.vendor': vendorId } ];
      }
    } else if (user.role === 'vendor') {
      // vendor: only their orders
      const vid = user._id;
      filter.$or = [ { 'items.vendor': vid }, { 'vendorAddresses.vendor': vid }, { 'vendorAddress.vendor': vid } ];
    } else if (user.role === 'driver') {
      // driver: orders assigned to driver doc linked to this user
      try {
        const Driver = require('../models/Driver');
        let driverDoc = null;
        if (user && user._id) driverDoc = await Driver.findOne({ user: user._id });
        if (!driverDoc && user.phone) driverDoc = await Driver.findOne({ phone: user.phone });
        if (!driverDoc && user.displayName) driverDoc = await Driver.findOne({ name: user.displayName });
        if (driverDoc) filter.driver = driverDoc._id;
        else return res.status(400).json({ message: 'Driver profile not found' });
      } catch (e) {
        return res.status(500).json({ message: 'Server error' });
      }
    } else {
      // customers: only their own orders
      filter.user = user._id;
    }

    const orders = await Order.find(filter).populate('user', 'email name').sort({ createdAt: -1 }).lean();

    const headers = ['orderId','createdAt','status','customerEmail','customerName','product','price','quantity','vendorId','vendorRevenue','total'];
    const rows = [headers.join(',')];

    for (const o of orders) {
      const created = new Date(o.createdAt).toISOString();
      const customerEmail = (o.user && o.user.email) ? o.user.email : '';
      const customerName = (o.user && o.user.name) ? o.user.name : '';
      for (const it of (o.items || [])) {
        const cols = [
          o._id.toString(),
          `"${created}"`,
          (o.status || ''),
          `"${customerEmail}"`,
          `"${customerName}"`,
          `"${(it.name || '').replace(/"/g,'""') }"`,
          it.price || 0,
          it.quantity || 0,
          it.vendor ? it.vendor.toString() : '',
          it.vendorRevenue || 0,
          o.total || 0,
        ];
        rows.push(cols.join(','));
      }
    }

    const csv = rows.join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="orders_export_${Date.now()}.csv"`);
    return res.send(csv);
  } catch (e) {
    console.error('orders.exportOrdersCsv error', e);
    return res.status(500).json({ message: 'Server error' });
  }
};

// PUT /api/orders/:id/status - update order status (driver allowed to update delivering/delivered)
exports.updateOrderStatus = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });

    const { status } = req.body;
    if (!status) return res.status(400).json({ message: 'Missing status' });

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    // Driver permissions
    if (req.user.role === 'driver') {
      // only allow certain transitions
      const allowed = ['out_for_delivery', 'delivered'];
      if (!allowed.includes(status)) return res.status(403).json({ message: 'Forbidden status update' });

      // verify assignment
      let permitted = false;
      try {
        let driverDoc = null;
        if (req.user.phone) driverDoc = await Driver.findOne({ phone: req.user.phone });
        if (!driverDoc && req.user.displayName) driverDoc = await Driver.findOne({ name: req.user.displayName });
        const assignedInProfile = req.user.driverProfile && Array.isArray(req.user.driverProfile.assignedOrders) && req.user.driverProfile.assignedOrders.some(a => a.toString() === order._id.toString());
        const assignedToDriver = driverDoc && order.driver && order.driver.toString() === driverDoc._id.toString();
        if (assignedInProfile || assignedToDriver) permitted = true;
      } catch (e) {}

      if (!permitted) return res.status(403).json({ message: 'Not assigned to you' });

      order.status = status;
      await order.save();

        // If order is completed (delivered) remove it from driver's assignedOrders and notify clients
        try {
            if (['delivered', 'picked_up_my_order', 'cancelled'].includes(status) && order.driver) {
                // remove order from driver's assigned list but preserve `order.driver` for historical queries
                await Driver.findByIdAndUpdate(order.driver, { $pull: { assignedOrders: order._id }, $unset: { currentAssignedOrder: 1 } }).exec();
                // preserve order.driver/assignedAt/assignedBy so driver history queries still show who was assigned
            try {
              const io = req.app.get('io');
              if (io) {
                try {
                  const sockets = await io.in(`order:${order._id}`).allSockets();
                  console.debug('[orderController] emitting orderAssigned (cleanup) rooms', { orderId: order._id.toString(), orderRoomCount: sockets.size, sampleSockets: Array.from(sockets).slice(0,5) });
                } catch (logErr) { console.warn('orderController: failed to inspect order room sockets', logErr && logErr.message); }
                io.to(`order:${order._id}`).emit('orderAssigned', { orderId: order._id, assignedTo: null });
                io.to(`user:${order.user}`).emit('orderAssigned', { orderId: order._id, assignedTo: null });
              }
            } catch (e) { /* ignore socket failures */ }
          }
        } catch (e) { console.warn('Failed to cleanup driver assignedOrders', e && e.message); }

      try {
        const io = req.app.get('io');
        if (io) {
          io.to(`order:${order._id}`).emit('orderUpdate', { action: 'status', orderId: order._id, order });
          io.to(`user:${order.user}`).emit('orderUpdate', { action: 'status', orderId: order._id, order });
        }
      } catch (e) { /* ignore */ }

      // If completed (delivered or picked up), create per-vendor rating notifications for the customer
      try {
        if (['delivered', 'picked_up_my_order', 'completed'].includes(status)) {
          // collect vendor ids from vendorAddresses or items
          const vendorIds = new Set();
          if (order.vendorAddresses && order.vendorAddresses.length > 0) {
            order.vendorAddresses.forEach(a => { if (a && a.vendor) vendorIds.add(String(a.vendor)); });
          }
          if (order.vendorAddress && order.vendorAddress.vendor) vendorIds.add(String(order.vendorAddress.vendor));
          // fallback to items
          if ((vendorIds.size === 0) && Array.isArray(order.items)) {
            order.items.forEach(it => { if (it.vendor) vendorIds.add(String(it.vendor)); });
          }

          for (const vid of Array.from(vendorIds)) {
            try {
              const note = await Notification.create({ user: order.user, title: `Rate your vendor`, body: `Please rate your experience with the vendor.`, data: { orderId: order._id, vendor: vid, type: 'rate_vendor' } });
              try { const io = req.app.get('io'); if (io) io.to(`user:${order.user}`).emit('notification', note); } catch (e) { /* ignore */ }
            } catch (e) { console.warn('Failed to create rate_vendor notification', e && e.message); }
          }
          // Notify customer to rate driver (if assigned)
          try {
            if (order.driver) {
              const note = await Notification.create({ user: order.user, title: `Rate your driver`, body: `Please rate the delivery driver for your order.`, data: { orderId: order._id, driver: order.driver, type: 'rate_driver' } });
              try { const io = req.app.get('io'); if (io) io.to(`user:${order.user}`).emit('notification', note); } catch (e) { /* ignore */ }
            }
          } catch (e) { console.warn('Failed to create rate_driver notification', e && e.message); }

          // Notify customer to rate products included in the order
          try {
            if (Array.isArray(order.items)) {
              for (const it of order.items) {
                try {
                  if (it && it.product) {
                    const note = await Notification.create({ user: order.user, title: `Rate product`, body: `Please rate the product you ordered.`, data: { orderId: order._id, product: it.product, type: 'rate_product' } });
                    try { const io = req.app.get('io'); if (io) io.to(`user:${order.user}`).emit('notification', note); } catch (e) { /* ignore */ }
                  }
                } catch (e) { console.warn('Failed to create rate_product notification', e && e.message); }
              }
            }
          } catch (e) { console.warn('Failed to create product notifications', e && e.message); }

          // Notify vendors to rate the driver (if driver present)
          try {
            if (order.driver && vendorIds.size > 0) {
              for (const vid of Array.from(vendorIds)) {
                try {
                  await Notification.create({ user: vid, title: `Rate driver`, body: `Please rate the driver who handled your order.`, data: { orderId: order._id, driver: order.driver, vendor: vid, type: 'vendor_rate_driver' } });
                  // also emit socket to vendor user room
                  try {
                    const io = req.app.get('io');
                    if (io) io.to(`user:${vid}`).emit('notification', { orderId: order._id, type: 'vendor_rate_driver', vendor: vid, driver: order.driver });
                  } catch (e) { /* ignore socket notify */ }
                } catch (e) { console.warn('Failed to create vendor->rate_driver notification', e && e.message); }
              }
            }
          } catch (e) { console.warn('Failed to notify vendors to rate driver', e && e.message); }

          // Notify driver to rate vendors involved in the order
          try {
            if (order.driver && vendorIds.size > 0) {
              try {
                const driverDoc = await Driver.findById(order.driver).exec();
                const driverUserId = driverDoc && driverDoc.user ? driverDoc.user : null;
                if (driverUserId) {
                  // create a single notification containing vendor ids
                  await Notification.create({ user: driverUserId, title: `Rate vendors`, body: `Please rate the vendors involved in this delivery.`, data: { orderId: order._id, vendors: Array.from(vendorIds), type: 'driver_rate_vendors' } });
                  try {
                    const io = req.app.get('io');
                    if (io) io.to(`user:${driverUserId}`).emit('notification', { orderId: order._id, type: 'driver_rate_vendors', vendors: Array.from(vendorIds) });
                  } catch (e) { /* ignore socket notify */ }
                }
              } catch (e) { console.warn('Failed to lookup driver doc for rating notifications', e && e.message); }
            }
          } catch (e) { console.warn('Failed to notify driver to rate vendors', e && e.message); }
        }
      } catch (e) { console.warn('delivered-notify failed', e && e.message); }

      return res.status(200).json({ message: 'Status updated', order });
    }

    return res.status(403).json({ message: 'Forbidden' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/orders/:id/confirm-pickup - customer confirms they picked up the order
exports.confirmPickup = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    // only owner can confirm pickup
    if (!order.user || order.user.toString() !== userId.toString()) return res.status(403).json({ message: 'Forbidden' });

    if (order.serviceType !== 'pickup') return res.status(400).json({ message: 'Order is not pickup type' });
    if (order.status !== 'ready_for_pickup') return res.status(400).json({ message: `Order status must be 'ready' to confirm pickup` });

    order.status = 'picked_up_my_order';
    await order.save();

    try { const io = req.app.get('io'); if (io) { io.to(`order:${order._id}`).emit('orderUpdate', { action: 'picked_up', orderId: order._id, order }); io.to(`user:${order.user}`).emit('orderUpdate', { action: 'picked_up', orderId: order._id, order }); } } catch (e) {}

    // Persist and emit notifications for picked_up_my_order: notify customer and vendors
    try {
      const io2 = req.app.get('io');
      // notify customer
      try {
        const note = await Notification.create({ user: order.user, title: `Order ${order._id.toString().slice(-6).toUpperCase()} picked up`, body: `You confirmed pickup of your order.`, data: { orderId: order._id, type: 'picked_up_my_order' } });
        try { if (io2) io2.to(`user:${order.user}`).emit('notification', note); } catch (e) {}
      } catch (e) { console.warn('confirmPickup: customer notification failed', e && e.message); }

      // notify vendors involved
      try {
        const vendorIds = new Set();
        if (order.vendorAddresses && order.vendorAddresses.length > 0) order.vendorAddresses.forEach(a => { if (a && a.vendor) vendorIds.add(String(a.vendor)); });
        if (order.vendorAddress && order.vendorAddress.vendor) vendorIds.add(String(order.vendorAddress.vendor));
        if ((vendorIds.size === 0) && Array.isArray(order.items)) order.items.forEach(it => { if (it && it.vendor) vendorIds.add(String(it.vendor)); });
        for (const vid of Array.from(vendorIds)) {
          try {
            const vnote = await Notification.create({ user: vid, title: `Order ${order._id.toString().slice(-6).toUpperCase()} picked up`, body: `An item from your vendor was picked up by the customer.`, data: { orderId: order._id, type: 'vendor_picked', vendor: vid } });
            try { if (io2) io2.to(`user:${vid}`).emit('notification', vnote); } catch (e) {}
          } catch (e) { console.warn('confirmPickup: vendor notification failed for', vid, e && e.message); }
        }
      } catch (e) { console.warn('confirmPickup: vendor notification loop failed', e && e.message); }
    } catch (e) { console.warn('confirmPickup: notification failed', e && e.message); }

    return res.status(200).json({ message: 'Pickup confirmed', order });
  } catch (e) {
    console.error('confirmPickup error', e);
    return res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/orders/:id/complete - customer marks pickup order as completed (delivered)
exports.completeOrder = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    // only owner can complete
    if (!order.user || order.user.toString() !== userId.toString()) return res.status(403).json({ message: 'Forbidden' });

    if (order.serviceType !== 'pickup') return res.status(400).json({ message: 'Order is not pickup type' });
    if (!['order_picked_up','ready_for_pickup'].includes(order.status)) return res.status(400).json({ message: 'Order not in a state that can be completed' });

    const prevStatus = order.status;
    order.status = 'delivered';
    await order.save();

    try { const io = req.app.get('io'); if (io) { io.to(`order:${order._id}`).emit('orderUpdate', { action: 'delivered', orderId: order._id, order }); io.to(`user:${order.user}`).emit('orderUpdate', { action: 'delivered', orderId: order._id, order }); } } catch (e) {}

    return res.status(200).json({ message: 'Order completed', order });
  } catch (e) {
    console.error('completeOrder error', e);
    return res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/orders/:id/vendor/:vendorId/prepare - vendor marks their stop as preparing
exports.vendorPrepare = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });
    if (req.user.role !== 'vendor') return res.status(403).json({ message: 'Forbidden' });

    const vendorId = req.params.vendorId;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    // ensure vendor is part of this order's vendorAddresses or vendorAddress
    let found = false;
    const addresses = order.vendorAddresses || [];
    for (let i = 0; i < addresses.length; i++) {
      const v = addresses[i];
      if (v && v.vendor && String(v.vendor) === String(vendorId)) {
        addresses[i].preparing = true;
        addresses[i].preparingAt = new Date();
        found = true;
        break;
      }
    }
    // fallback to single vendorAddress
    if (!found && order.vendorAddress && order.vendorAddress.vendor && String(order.vendorAddress.vendor) === String(vendorId)) {
      order.vendorAddress.preparing = true;
      order.vendorAddress.preparingAt = new Date();
      found = true;
    }

    // Fallback: some orders store vendor on items instead of vendorAddresses/vendorAddress
    if (!found && Array.isArray(order.items) && order.items.length > 0) {
      for (let it of order.items) {
        try {
          const vobj = it.vendor;
          const vid = vobj && (vobj._id || vobj.id) ? (vobj._id || vobj.id) : vobj;
          if (vid && String(vid) === String(vendorId)) {
            it.preparing = true;
            it.preparingAt = new Date();
            found = true;
          }
        } catch (e) { /* ignore per-item parse errors */ }
      }
    }

    if (!found) return res.status(403).json({ message: 'Vendor not part of this order' });

    // set global order status to preparing if not already
    if (!order.status || !String(order.status).toLowerCase().includes('prepar')) order.status = 'preparing_your_meal';
    order.vendorAddresses = addresses;
    await order.save();

    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`order:${order._id}`).emit('orderUpdate', { action: 'vendorPreparing', orderId: order._id, order, vendor: vendorId });
        io.to(`user:${order.user}`).emit('orderUpdate', { action: 'vendorPreparing', orderId: order._id, order, vendor: vendorId });
        io.to(`user:${vendorId}`).emit('orderUpdate', { action: 'vendorPreparing', orderId: order._id, order, vendor: vendorId });
      }
    } catch (e) { console.warn('vendorPrepare: socket emit failed', e && e.message); }

    try {
      const note = await Notification.create({ user: order.user, title: `Order ${order._id.toString().slice(-6).toUpperCase()} being prepared`, body: `A vendor has started preparing an item.`, data: { orderId: order._id, vendor: vendorId, type: 'vendor_preparing' } });
      try { const io = req.app.get('io'); if (io) io.to(`user:${order.user}`).emit('notification', note); } catch (e) { /* ignore socket notify failure */ }
    } catch (e) { console.warn('vendorPrepare: notification failed', e && e.message); }

    return res.status(200).json({ message: 'Marked preparing', order });
  } catch (e) {
    console.error('vendorPrepare error', e);
    return res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/orders/:id/vendor/:vendorId/ready - vendor marks their stop as ready
exports.vendorReady = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });
    if (req.user.role !== 'vendor') return res.status(403).json({ message: 'Forbidden' });

    const vendorId = req.params.vendorId;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });


    let found = false;
    const addresses = order.vendorAddresses || [];
    for (let i = 0; i < addresses.length; i++) {
      const v = addresses[i];
      if (v && v.vendor && String(v.vendor) === String(vendorId)) {
        addresses[i].ready = true;
        addresses[i].readyAt = new Date();
        found = true;
        break;
      }
    }
    if (!found && order.vendorAddress && order.vendorAddress.vendor && String(order.vendorAddress.vendor) === String(vendorId)) {
      order.vendorAddress.ready = true;
      order.vendorAddress.readyAt = new Date();
      found = true;
    }

    // Fallback: check items for vendor and mark item.ready
    if (!found && Array.isArray(order.items) && order.items.length > 0) {
      for (let it of order.items) {
        try {
          const vobj = it.vendor;
          const vid = vobj && (vobj._id || vobj.id) ? (vobj._id || vobj.id) : vobj;
          if (vid && String(vid) === String(vendorId)) {
            it.ready = true;
            it.readyAt = new Date();
            found = true;
          }
        } catch (e) { /* ignore */ }
      }
    }

    if (!found) return res.status(403).json({ message: 'Vendor not part of this order' });

    order.vendorAddresses = addresses;

    // If all vendor stops are ready (or single vendor), mark order as ready
    let allReady = true;
    if (order.vendorAddresses && order.vendorAddresses.length > 0) {
      for (const a of order.vendorAddresses) {
        if (!a.ready) { allReady = false; break; }
      }
    } else if (order.vendorAddress) {
      allReady = !!order.vendorAddress.ready;
    } else if (Array.isArray(order.items) && order.items.length > 0) {
      // consider per-item ready flags as fallback
      for (const it of order.items) {
        if (!it.ready) { allReady = false; break; }
      }
    }

    if (allReady) {
      order.status = 'ready_for_pickup';
    }

    await order.save();

      try {
        const io = req.app.get('io');
        if (io) {
          io.to(`order:${order._id}`).emit('orderUpdate', { action: 'vendorReady', orderId: order._id, order, vendor: vendorId });
          io.to(`user:${order.user}`).emit('orderUpdate', { action: 'vendorReady', orderId: order._id, order, vendor: vendorId });
          io.to(`user:${vendorId}`).emit('orderUpdate', { action: 'vendorReady', orderId: order._id, order, vendor: vendorId });
        }
      } catch (e) { console.warn('vendorReady: socket emit failed', e && e.message); }

    try {
      const note = await Notification.create({
        user: order.user,
        title: `Order ${order._id.toString().slice(-6).toUpperCase()} ready for pickup`,
        body: `A vendor marked their items ready.`,
        data: { orderId: order._id, vendor: vendorId, type: 'vendor_ready', serviceType: order.serviceType || 'delivery' }
      });
      try {
        const io = req.app.get('io');
        if (io) {
          // notify customer always
          io.to(`user:${order.user}`).emit('notification', note);
          // broadcast to drivers only for delivery orders
          if (!order.serviceType || String(order.serviceType).toLowerCase() === 'delivery') {
            io.to('drivers').emit('notification', { orderId: order._id, type: 'ready_for_pickup', title: note.title, body: note.body, serviceType: 'delivery' });
          }
        }
      } catch (e) { /* ignore socket notify failure */ }
    } catch (e) { console.warn('vendorReady: notification failed', e && e.message); }

    return res.status(200).json({ message: 'Marked ready', order });
  } catch (e) {
    console.error('vendorReady error', e);
    return res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/orders/:id/vendor/:vendorId/picked - vendor marks their stop as picked (customer/driver picked up)
exports.vendorPicked = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });
    if (req.user.role !== 'vendor') return res.status(403).json({ message: 'Forbidden' });

    const vendorId = req.params.vendorId;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    // ensure vendor is part of this order's vendorAddresses or vendorAddress
    let found = false;
    const addresses = order.vendorAddresses || [];
    for (let i = 0; i < addresses.length; i++) {
      const v = addresses[i];
      if (v && v.vendor && String(v.vendor) === String(vendorId)) {
        addresses[i].visited = true;
        addresses[i].visitedAt = new Date();
        found = true;
        break;
      }
    }
    // fallback to single vendorAddress
    if (!found && order.vendorAddress && order.vendorAddress.vendor && String(order.vendorAddress.vendor) === String(vendorId)) {
      order.vendorAddress.visited = true;
      order.vendorAddress.visitedAt = new Date();
      found = true;
    }

    // Fallback: check items for vendor and mark item.visited
    if (!found && Array.isArray(order.items) && order.items.length > 0) {
      for (let it of order.items) {
        try {
          const vobj = it.vendor;
          const vid = vobj && (vobj._id || vobj.id) ? (vobj._id || vobj.id) : vobj;
          if (vid && String(vid) === String(vendorId)) {
            it.visited = true;
            it.visitedAt = new Date();
            found = true;
          }
        } catch (e) { /* ignore */ }
      }
    }

    if (!found) return res.status(403).json({ message: 'Vendor not part of this order' });

    order.vendorAddresses = addresses;

    // Don't allow vendor to mark picked for delivery orders if no driver assigned
    if (order.serviceType === 'delivery' && (!order.driver || String(order.driver) === '')) {
      return res.status(400).json({ message: 'Cannot mark picked up before a driver is assigned' });
    }

    // if all vendor stops visited, change status to order_picked_up
    let allVisited = true;
    if (order.vendorAddresses && order.vendorAddresses.length > 0) {
      for (const a of order.vendorAddresses) {
        if (!a.visited) { allVisited = false; break; }
      }
    } else if (order.vendorAddress) {
      allVisited = !!order.vendorAddress.visited;
    } else if (Array.isArray(order.items) && order.items.length > 0) {
      // if all items have visited flag, consider order picked up
      for (const it of order.items) {
        if (!it.visited) { allVisited = false; break; }
      }
    }
    if (allVisited) order.status = 'order_picked_up';

    await order.save();

    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`order:${order._id}`).emit('orderUpdate', { action: 'vendorPicked', orderId: order._id, order, vendor: vendorId });
        io.to(`user:${order.user}`).emit('orderUpdate', { action: 'vendorPicked', orderId: order._id, order, vendor: vendorId });
        io.to(`user:${vendorId}`).emit('orderUpdate', { action: 'vendorPicked', orderId: order._id, order, vendor: vendorId });
      }
    } catch (e) { /* ignore socket failures */ }

    try {
      await Notification.create({ user: order.user, title: `Order ${order._id.toString().slice(-6).toUpperCase()} picked up`, body: `An item was picked up by customer/driver.`, data: { orderId: order._id, vendor: vendorId, type: 'vendor_picked' } });
    } catch (e) { /* ignore */ }

    return res.status(200).json({ message: 'Marked picked', order });
  } catch (e) {
    console.error('vendorPicked error', e);
    return res.status(500).json({ message: 'Server error' });
  }
};

// PUT /api/orders/:id/cancel - cancel order
exports.cancelOrder = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    // Allow cancellation for: admin, vendor (if they own the vendor on the order), customer (owner) and users without a role
    let permitted = false;
    try {
      if (req.user.role === 'admin') {
        permitted = true;
      } else if (req.user.role === 'vendor') {
        // check vendor ownership on the order (vendorAddresses entries)
        const vendorIds = new Set();
        if (Array.isArray(order.vendorAddresses)) {
          order.vendorAddresses.forEach(v => { if (v && v.vendor) vendorIds.add(String(v.vendor)); });
        }
        if (order.vendorAddress && order.vendorAddress.vendor) vendorIds.add(String(order.vendorAddress.vendor));
        if (vendorIds.has(String(userId))) permitted = true;
      } else if (!req.user.role || req.user.role === 'customer') {
        if (order.user && order.user.toString() === userId.toString()) permitted = true;
      }
    } catch (e) { /* ignore */ }

    if (!permitted) return res.status(403).json({ message: 'Forbidden' });

    // Disallow cancellation once order is being prepared or already on the way/delivered/cancelled
    if (!order.status) order.status = '';
    const statusLower = String(order.status).toLowerCase();
    if (['delivered', 'picked_up_my_order', 'cancelled'].includes(statusLower) || statusLower.includes('prepar') || statusLower.includes('deliver')) {
      return res.status(400).json({ message: `Cannot cancel order with status ${order.status}` });
    }

    order.status = 'cancelled';
    await order.save();

    // If order had a driver assigned, remove it from driver's assignedOrders and unset assignment on the order
    try {
      if (order.driver) {
        // remove order from driver's assigned list but keep `order.driver` for history
        await Driver.findByIdAndUpdate(order.driver, { $pull: { assignedOrders: order._id }, $unset: { currentAssignedOrder: 1 } }).exec();
      }
    } catch (e) { console.warn('Failed to cleanup driver assignedOrders on cancel', e && e.message); }

    try {
      const io = req.app.get('io');
      if (io) {
        // notify the order owner and the order room
        io.to(`user:${order.user}`).emit('orderUpdate', { action: 'cancel', orderId: order._id, order });
        io.to(`order:${order._id}`).emit('orderUpdate', { action: 'cancel', orderId: order._id, order });
      }
    } catch (e) { console.warn('Socket emit failed', e); }

    // Persist notification for cancellation
    try {
      const note = await Notification.create({
        user: order.user,
        title: `Order ${order._id?.toString().slice(-6).toUpperCase()} cancelled`,
        body: `Your order has been cancelled.`,
        data: { orderId: order._id, type: 'order_cancelled' }
      });
      try {
        const io2 = req.app.get('io');
        if (io2) io2.to(`user:${order.user}`).emit('notification', note);
      } catch (e) { /* ignore socket notify failure */ }
    } catch (e) { console.warn('Failed to create notification', e.message); }

    // Also notify vendors and assigned driver about cancellation
    try {
      const io3 = req.app.get('io');
      const vendorIds = new Set();
      if (order.vendorAddresses && order.vendorAddresses.length > 0) order.vendorAddresses.forEach(a => { if (a && a.vendor) vendorIds.add(String(a.vendor)); });
      if (order.vendorAddress && order.vendorAddress.vendor) vendorIds.add(String(order.vendorAddress.vendor));
      if ((vendorIds.size === 0) && Array.isArray(order.items)) order.items.forEach(it => { if (it && it.vendor) vendorIds.add(String(it.vendor)); });
      for (const vid of Array.from(vendorIds)) {
        try {
          const vnote = await Notification.create({ user: vid, title: `Order ${order._id.toString().slice(-6).toUpperCase()} cancelled`, body: `An order including your items was cancelled.`, data: { orderId: order._id, type: 'order_cancelled', vendor: vid } });
          try { if (io3) io3.to(`user:${vid}`).emit('notification', vnote); } catch (e) {}
        } catch (e) { console.warn('cancel: vendor notification failed for', vid, e && e.message); }
      }
      // notify driver user if assigned
      try {
        if (order.driver) {
          const driverDoc = await Driver.findById(order.driver).exec();
          const driverUserId = driverDoc && driverDoc.user ? driverDoc.user : null;
          if (driverUserId) {
            const dnote = await Notification.create({ user: driverUserId, title: `Order ${order._id.toString().slice(-6).toUpperCase()} cancelled`, body: `An assigned order has been cancelled.`, data: { orderId: order._id, type: 'order_cancelled', driver: driverUserId } });
            try { if (io3) io3.to(`user:${driverUserId}`).emit('notification', dnote); } catch (e) {}
          }
        }
      } catch (e) { console.warn('cancel: driver notification failed', e && e.message); }
    } catch (e) { console.warn('cancel: notify vendors/driver failed', e && e.message); }

    return res.status(200).json({ message: 'Order cancelled', order });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/orders/:id/assign - driver claims an order (atomic)
exports.assignOrder = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });
    if (req.user.role !== 'driver') return res.status(403).json({ message: 'Forbidden' });

    console.debug('[orderController] assignOrder called by user=', userId, 'orderId=', req.params.id);

    // Resolve driver document
    let driverDoc = null;
    // Prefer a Driver linked to the current user first
    try {
      driverDoc = await Driver.findOne({ user: userId });
    } catch (e) { /* ignore */ }

    // Fallback: match by phone or display name
    if (!driverDoc) {
      if (req.user.phone) driverDoc = await Driver.findOne({ phone: req.user.phone });
      if (!driverDoc && req.user.displayName) driverDoc = await Driver.findOne({ name: req.user.displayName });
    }

    // If we found a Driver by phone/name but it is linked to a different user, don't reuse it.
    if (driverDoc && driverDoc.user && String(driverDoc.user) !== String(userId)) {
      console.info('[orderController] found driver doc by phone/name linked to different user; creating fresh driver for current user', { foundDriverId: driverDoc._id.toString(), linkedUser: driverDoc.user.toString(), currentUser: String(userId) });
      driverDoc = null;
    }

    try { console.debug('[orderController] driverDoc after resolution', { driverId: driverDoc && driverDoc._id && driverDoc._id.toString(), linkedUser: driverDoc && driverDoc.user && driverDoc.user.toString(), driverName: driverDoc && driverDoc.name }); } catch (logErr) {}

    // If we found a Driver doc that's linked to a stale/deleted user, reassign it to current user
    if (driverDoc && driverDoc.user) {
      try {
        const exists = await User.exists({ _id: driverDoc.user });
        if (!exists) {
          // previous user was removed; re-link to current user
          driverDoc = await Driver.findByIdAndUpdate(driverDoc._id, { $set: { user: userId } }, { new: true }).exec();
        }
      } catch (e) { /* ignore */ }
    }

    // If no Driver doc exists, create one and link to this user
    if (!driverDoc && req.user.role === 'driver') {
      try {
        const name = req.user.displayName || req.user.name || 'Driver';
        const phone = req.user.phone || (req.user.driverProfile && req.user.driverProfile.phone) || null;
        // Create or find a Driver document scoped to this authenticated user to avoid
        // clobbering an existing Driver record that may belong to another account.
        driverDoc = await Driver.findOneAndUpdate(
          { user: userId },
          { $setOnInsert: { name, phone, avatar: req.user.avatar || null, active: true, user: userId }, $set: { user: userId } },
          { upsert: true, new: true }
        ).exec();
      } catch (e) {
        console.warn('Failed to create/find Driver doc from user profile', e && e.message);
      }
    }

    // Extra fallback: if driverDoc still not found, attempt to create a minimal Driver record
    if (!driverDoc && req.user.role === 'driver') {
      try {
        const name = req.user.displayName || req.user.name || 'Driver';
        const phone = req.user.phone || (req.user.driverProfile && req.user.driverProfile.phone) || null;
        driverDoc = await Driver.create({ name, phone, avatar: req.user.avatar || null, active: true, user: userId });
        console.info('[orderController] created fallback Driver doc', { driverId: driverDoc._id.toString(), user: userId.toString() });
      } catch (e) {
        console.warn('Fallback creation of Driver doc failed', e && e.message);
      }
    }

    if (!driverDoc) return res.status(400).json({ message: 'Driver profile not found' });

    // Ensure driver does not already have an active assigned order
    const active = await Order.findOne({ driver: driverDoc._id, status: { $in: ['driver_assigned', 'out_for_delivery'] } });
    try { console.debug('[orderController] active assignment check', { driverId: driverDoc._id.toString(), hasActive: !!active, activeOrderId: active && active._id && active._id.toString() }); } catch (logErr) {}
    if (active) {
      console.info('[orderController] driver already has active order', { driverId: driverDoc._id.toString(), activeOrderId: active._id.toString() });
      return res.status(409).json({ message: 'Driver already has an active assigned order', activeOrderId: active._id });
    }

    // Attempt atomic assign only if driver field is null
    const orderId = req.params.id;
    const updatePayload = { $set: { driver: driverDoc._id, assignedAt: new Date(), assignedBy: userId, status: 'driver_assigned' } };
    // If frontend provided a pickup order (reordered vendor addresses), persist it
    if (req.body && Array.isArray(req.body.vendorPickupOrder) && req.body.vendorPickupOrder.length > 0) {
      updatePayload.$set.vendorAddresses = req.body.vendorPickupOrder;
    }

    console.debug('[orderController] attempting atomic assign', { orderId, driverId: driverDoc._id.toString(), matchQuery: { _id: orderId, driver: { $in: [null, undefined] } }, updatePayloadSample: { status: updatePayload.$set && updatePayload.$set.status } });
    // log pre-assign order snapshot
    try { const pre = await Order.findById(orderId).select('driver status assignedAt assignedBy'); console.debug('[orderController] pre-assign order snapshot', { orderId, preDriver: pre && pre.driver, preStatus: pre && pre.status }); } catch (logErr) { console.warn('pre-assign snapshot failed', logErr && logErr.message); }
    const assigned = await Order.findOneAndUpdate(
      { _id: orderId, driver: { $in: [null, undefined] } },
      updatePayload,
      { new: true }
    ).populate('user', 'name email').populate('driver', 'name phone avatar');
    try { console.debug('[orderController] post-assign order snapshot', { orderId, assigned: assigned && { id: assigned._id && assigned._id.toString(), driver: assigned.driver && assigned.driver._id && assigned.driver._id.toString(), status: assigned.status } }); } catch (logErr) {}
    console.debug('[orderController] assignOrder result for orderId=', orderId, 'assigned?', !!assigned);

    const io = req.app.get('io');
    if (!assigned) {
      // Order already assigned — find current assignee to include information
      const existing = await Order.findById(orderId).populate('driver', 'name');
      console.warn('[orderController] assign failed - order already assigned', { orderId, existingDriver: existing && existing.driver ? existing.driver._id : null });
      if (io) {
        try {
          const sockets = await io.in(`order:${orderId}`).allSockets();
          console.debug('[orderController] emitting orderAssigned (already assigned) rooms', { orderId: orderId, orderRoomCount: sockets.size, sampleSockets: Array.from(sockets).slice(0,5) });
        } catch (logErr) { console.warn('orderController: failed to inspect order room sockets', logErr && logErr.message); }
        // try to include driver user id for frontend convenience
        let assignedToUserId = null;
        try { if (existing && existing.driver && existing.driver._id) { const drv = await Driver.findById(existing.driver._id).select('user'); if (drv && drv.user) assignedToUserId = drv.user; } } catch (ee) {}
        io.to(`order:${orderId}`).emit('orderAssigned', { orderId, assignedTo: existing && existing.driver ? { _id: existing.driver._id, name: existing.driver.name } : null, assignedToUserId });
      }
      return res.status(409).json({ message: 'Order already assigned', assignedTo: existing && existing.driver ? existing.driver : null });
    }

    // Update driver's assignedOrders list atomically and set currentAssignedOrder
    try {
      const drvUpdate = await Driver.findByIdAndUpdate(driverDoc._id, { $addToSet: { assignedOrders: assigned._id }, $set: { user: driverDoc.user || userId, currentAssignedOrder: assigned._id } }, { new: true }).exec();
      try { console.debug('[orderController] driver doc updated', { driverId: driverDoc._id.toString(), drvUpdateId: drvUpdate && drvUpdate._id && drvUpdate._id.toString(), currentAssignedOrder: drvUpdate && drvUpdate.currentAssignedOrder }); } catch (logErr) {}
    } catch (e) { console.warn('Failed to update driver assignedOrders', e && e.message); }

    // Also mirror assignment into the linked User document driverProfile.assignedOrders/currentAssignedOrder
    try {
      const linkedUserId = driverDoc.user || userId;
      if (linkedUserId) {
        const userUpdate = await User.findByIdAndUpdate(linkedUserId, { $addToSet: { 'driverProfile.assignedOrders': assigned._id }, $set: { 'driverProfile.currentAssignedOrder': assigned._id } }, { new: true }).exec();
        try { console.debug('[orderController] mirrored assignment to User.driverProfile', { linkedUserId: linkedUserId && linkedUserId.toString(), assignedOrdersCount: userUpdate && userUpdate.driverProfile && Array.isArray(userUpdate.driverProfile.assignedOrders) ? userUpdate.driverProfile.assignedOrders.length : undefined, currentAssignedOrder: userUpdate && userUpdate.driverProfile && userUpdate.driverProfile.currentAssignedOrder }); } catch (logErr) {}
        // Emit userUpdated event to the driver's user room so connected clients refresh
        try {
          const io2 = req.app.get('io');
          if (io2) {
            io2.to(`user:${linkedUserId}`).emit('userUpdated', { userId: linkedUserId, driverProfile: userUpdate && userUpdate.driverProfile ? userUpdate.driverProfile : null });
            console.debug('[orderController] emitted userUpdated to driver user room', { linkedUserId: linkedUserId && linkedUserId.toString() });
          }
        } catch (emitErr) { console.warn('Failed to emit userUpdated to driver', emitErr && emitErr.message); }
      }
    } catch (e) { console.warn('Failed to mirror assignment to User.driverProfile', e && e.message); }

    // Emit socket events to order room and to user
    try {
      if (io) {
        try {
          const sockets = await io.in(`order:${orderId}`).allSockets();
          console.debug('[orderController] emitting orderAssigned (assigned) rooms', { orderId: orderId, orderRoomCount: sockets.size, sampleSockets: Array.from(sockets).slice(0,5) });
        } catch (logErr) { console.warn('orderController: failed to inspect order room sockets', logErr && logErr.message); }
        io.to(`order:${orderId}`).emit('orderAssigned', { orderId, assignedTo: { _id: driverDoc._id, name: driverDoc.name, phone: driverDoc.phone }, assignedToUserId: driverDoc.user || userId });
        try { console.debug('[orderController] emitting orderAssigned to customer room', { customerRoom: `user:${assigned.user._id}`, payload: { orderId, assignedTo: { _id: driverDoc._id, name: driverDoc.name } } }); } catch (logErr) {}
        io.to(`user:${assigned.user._id}`).emit('orderAssigned', { orderId, assignedTo: { _id: driverDoc._id, name: driverDoc.name }, assignedToUserId: driverDoc.user || userId });
      }
    } catch (e) { console.warn('Socket emit failed', e && e.message); }

    // Persist and emit a notification to the customer that a driver was assigned
    try {
      const note = await Notification.create({ user: assigned.user._id, title: `Driver assigned to your order`, body: `A driver has been assigned to your order.`, data: { orderId: assigned._id, type: 'driver_assigned' } });
      try { const io2 = req.app.get('io'); if (io2) io2.to(`user:${assigned.user._id}`).emit('notification', note); } catch (e) { /* ignore */ }
    } catch (e) { console.warn('assignOrder: notification failed', e && e.message); }

    return res.status(200).json({ message: 'Order assigned', order: assigned });
  } catch (e) {
    console.error('assignOrder error', e);
    return res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/orders/:id/unassign - vendor or customer can unassign driver (move back to ready_for_pickup)
exports.unassignOrder = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    // Only allow admin, vendor (if they own a vendor on this order), the customer who placed the order,
    // or the driver who is currently assigned to this order
    let permitted = false;
    try {
      if (req.user.role === 'admin') permitted = true;
      else if (req.user.role === 'vendor') {
        const vendorIds = new Set();
        if (Array.isArray(order.vendorAddresses)) order.vendorAddresses.forEach(v => { if (v && v.vendor) vendorIds.add(String(v.vendor)); });
        if (order.vendorAddress && order.vendorAddress.vendor) vendorIds.add(String(order.vendorAddress.vendor));
        if (vendorIds.has(String(userId))) permitted = true;
      } else if (!req.user.role || req.user.role === 'customer') {
        if (order.user && order.user.toString() === userId.toString()) permitted = true;
      } else if (req.user.role === 'driver') {
        // Allow driver to unassign only if they are the driver assigned to this order
        try {
          // Resolve Driver doc linked to this authenticated user
          let driverDoc = null;
          try { driverDoc = await Driver.findOne({ user: userId }).select('_id').exec(); } catch (e) { /* ignore */ }
          if (!driverDoc && req.user.phone) {
            try { driverDoc = await Driver.findOne({ phone: req.user.phone }).select('_id').exec(); } catch (e) { /* ignore */ }
          }
          if (!driverDoc && req.user.displayName) {
            try { driverDoc = await Driver.findOne({ name: req.user.displayName }).select('_id').exec(); } catch (e) { /* ignore */ }
          }

          if (driverDoc) {
            const orderDriverId = (function() {
              try {
                const od = order.driver;
                if (!od) return null;
                if (typeof od === 'string' || typeof od === 'number') return String(od);
                if (od._id) return String(od._id);
                if (od.user) return String(od._id || od.user);
              } catch (e) { return null; }
              return null;
            })();
            if (orderDriverId && String(orderDriverId) === String(driverDoc._id)) permitted = true;
          } else {
            // Fallback: if order.driver contains a name matching current user's displayName/name
            try {
              const od = order.driver;
              const nameMatches = od && od.name && (req.user.displayName || req.user.name) && String(od.name) === String((req.user.displayName || req.user.name));
              if (nameMatches) permitted = true;
            } catch (e) { /* ignore */ }
          }
        } catch (e) { /* ignore driver check errors */ }
      }
    } catch (e) { /* ignore */ }

    if (!permitted) return res.status(403).json({ message: 'Forbidden' });

    // If there's no driver assigned, nothing to do
    if (!order.driver) return res.status(400).json({ message: 'No driver assigned' });

    const oldDriver = order.driver;

    // Remove driver assignment on the driver document
    try {
      await Driver.findByIdAndUpdate(oldDriver, { $pull: { assignedOrders: order._id }, $unset: { currentAssignedOrder: 1 } }).exec();
    } catch (e) { console.warn('unassignOrder: failed to cleanup driver assignedOrders', e && e.message); }

    // Also remove assignment from the linked User.driverProfile (if any) and emit update
    try {
      try {
        const drv = await Driver.findById(oldDriver).select('user').exec();
        const linkedUserId = drv && drv.user ? drv.user : null;
        if (linkedUserId) {
          const userUpdate = await User.findByIdAndUpdate(linkedUserId, { $pull: { 'driverProfile.assignedOrders': order._id }, $unset: { 'driverProfile.currentAssignedOrder': 1 } }, { new: true }).exec();
          try { console.debug('unassignOrder: mirrored user.driverProfile cleanup', { linkedUserId: linkedUserId && linkedUserId.toString(), assignedOrdersCount: userUpdate && userUpdate.driverProfile && Array.isArray(userUpdate.driverProfile.assignedOrders) ? userUpdate.driverProfile.assignedOrders.length : undefined }); } catch (logErr) {}
          try {
            const io2 = req.app.get('io');
            if (io2) {
              io2.to(`user:${linkedUserId}`).emit('userUpdated', { userId: linkedUserId, driverProfile: userUpdate && userUpdate.driverProfile ? userUpdate.driverProfile : null });
              console.debug('unassignOrder: emitted userUpdated to driver user room', { linkedUserId: linkedUserId && linkedUserId.toString() });
            }
          } catch (emitErr) { console.warn('unassignOrder: failed to emit userUpdated', emitErr && emitErr.message); }
        }
      } catch (ee) { console.warn('unassignOrder: failed to cleanup user.driverProfile.assignedOrders', ee && ee.message); }
    } catch (e) { /* ignore outer */ }

    // Update order: clear driver fields and set status to ready_for_pickup
    try {
      order.driver = undefined;
      order.assignedAt = undefined;
      order.assignedBy = undefined;
      order.status = 'ready_for_pickup';
      await order.save();
    } catch (e) { console.error('unassignOrder: failed saving order', e && e.message); return res.status(500).json({ message: 'Server error' }); }

    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`order:${order._id}`).emit('orderUpdate', { action: 'unassigned', orderId: order._id, order });
        io.to(`user:${order.user}`).emit('orderUpdate', { action: 'unassigned', orderId: order._id, order });
        // inform order room and drivers list
        io.to('drivers').emit('orderUnassigned', { orderId: order._id });
        // inform previously assigned driver user room that they were unassigned
        try {
          const driverDoc = await Driver.findById(oldDriver).select('user').exec();
          const driverUserId = driverDoc && driverDoc.user ? driverDoc.user : null;
          if (driverUserId) {
            // emit same event that frontend expects when assignment removed
            io.to(`user:${driverUserId}`).emit('orderAssigned', { orderId: order._id, assignedTo: null });
            // also send a notification to the driver
            const dnote = await Notification.create({ user: driverUserId, title: `Order ${order._id.toString().slice(-6).toUpperCase()} unassigned`, body: `You were unassigned from the order.`, data: { orderId: order._id, type: 'order_unassigned' } });
            io.to(`user:${driverUserId}`).emit('notification', dnote);
          }
        } catch (e) { /* ignore driver notify failures */ }
      }
    } catch (e) { console.warn('unassignOrder: socket emits failed', e && e.message); }

    // Persist and emit notifications to customer and vendors as well
    try {
      // Customer notification
      try {
        const cnote = await Notification.create({ user: order.user, title: `Order ${order._id.toString().slice(-6).toUpperCase()} unassigned`, body: `The driver was unassigned from your order.`, data: { orderId: order._id, type: 'order_unassigned' } });
        try { const io2 = req.app.get('io'); if (io2) io2.to(`user:${order.user}`).emit('notification', cnote); } catch (e) { /* ignore */ }
      } catch (e) { console.warn('unassign: customer notification failed', e && e.message); }

      // Vendor notifications
      try {
        const vendorIds = new Set();
        if (order.vendorAddresses && order.vendorAddresses.length > 0) order.vendorAddresses.forEach(a => { if (a && a.vendor) vendorIds.add(String(a.vendor)); });
        if (order.vendorAddress && order.vendorAddress.vendor) vendorIds.add(String(order.vendorAddress.vendor));
        if ((vendorIds.size === 0) && Array.isArray(order.items)) order.items.forEach(it => { if (it && it.vendor) vendorIds.add(String(it.vendor)); });
        const io3 = req.app.get('io');
        for (const vid of Array.from(vendorIds)) {
          try {
            const vnote = await Notification.create({ user: vid, title: `Order ${order._id.toString().slice(-6).toUpperCase()} unassigned`, body: `A driver was unassigned from an order containing your items.`, data: { orderId: order._id, type: 'order_unassigned', vendor: vid } });
            try { if (io3) io3.to(`user:${vid}`).emit('notification', vnote); } catch (e) { /* ignore */ }
          } catch (e) { console.warn('unassign: vendor notification failed for', vid, e && e.message); }
        }
      } catch (e) { console.warn('unassign: vendor notifications failed', e && e.message); }
    } catch (e) { /* ignore */ }

    return res.status(200).json({ message: 'Order unassigned', order });
  } catch (e) {
    console.error('unassignOrder error', e);
    return res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/orders/:id/start - driver starts delivery (sets status to out_for_delivery)
exports.startDelivery = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });
    if (req.user.role !== 'driver') return res.status(403).json({ message: 'Forbidden' });

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    // verify assignment
    let driverDoc = null;
    if (req.user && req.user._id) driverDoc = await Driver.findOne({ user: req.user._id });
    if (!driverDoc && req.user.phone) driverDoc = await Driver.findOne({ phone: req.user.phone });
    if (!driverDoc) return res.status(403).json({ message: 'Driver profile not found' });
    if (!order.driver || String(order.driver) !== String(driverDoc._id)) return res.status(403).json({ message: 'Not assigned to you' });

    order.status = 'out_for_delivery';
    await order.save();

    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`order:${order._id}`).emit('orderUpdate', { action: 'status', orderId: order._id, order });
        io.to(`user:${order.user}`).emit('orderUpdate', { action: 'status', orderId: order._id, order });
      }
    } catch (e) { console.warn('startDelivery: socket emit failed', e && e.message); }

    // Notify customer that order is out for delivery
    try {
      const note = await Notification.create({ user: order.user, title: `Order ${order._id.toString().slice(-6).toUpperCase()} out for delivery`, body: `Your order is out for delivery.`, data: { orderId: order._id, type: 'out_for_delivery' } });
      try { const io2 = req.app.get('io'); if (io2) io2.to(`user:${order.user}`).emit('notification', note); } catch (e) { /* ignore */ }
    } catch (e) { console.warn('startDelivery: notification failed', e && e.message); }

    return res.status(200).json({ message: 'Delivery started', order });
  } catch (e) {
    console.error('startDelivery error', e);
    return res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/orders/:id/stop/:index/visit - mark a vendor stop visited
exports.visitStop = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });
    if (req.user.role !== 'driver') return res.status(403).json({ message: 'Forbidden' });

    const idx = parseInt(req.params.index, 10);
    if (isNaN(idx)) return res.status(400).json({ message: 'Invalid stop index' });

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    // verify assignment
    let driverDoc = null;
    if (req.user && req.user._id) driverDoc = await Driver.findOne({ user: req.user._id });
    if (!driverDoc && req.user.phone) driverDoc = await Driver.findOne({ phone: req.user.phone });
    if (!driverDoc) return res.status(403).json({ message: 'Driver profile not found' });
    if (!order.driver || String(order.driver) !== String(driverDoc._id)) return res.status(403).json({ message: 'Not assigned to you' });

    const addresses = order.vendorAddresses || [];
    if (idx < 0 || idx >= addresses.length) return res.status(400).json({ message: 'Stop index out of bounds' });

    // mark visited
    addresses[idx].visited = true;
    addresses[idx].visitedAt = new Date();
    order.vendorAddresses = addresses;

    // if all vendor stops visited, change status to order_picked_up
    const allVisited = addresses.length > 0 && addresses.every(a => !!a.visited);
    if (allVisited) order.status = 'order_picked_up';

    await order.save();

    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`order:${order._id}`).emit('orderUpdate', { action: 'stopVisited', orderId: order._id, order, stopIndex: idx });
        io.to(`user:${order.user}`).emit('orderUpdate', { action: 'stopVisited', orderId: order._id, order, stopIndex: idx });
      }
    } catch (e) { console.warn('visitStop: socket emit failed', e && e.message); }

    // If order has been picked up (allVisited), notify customer of pickup
    try {
      if (allVisited) {
        const note = await Notification.create({ user: order.user, title: `Order ${order._id.toString().slice(-6).toUpperCase()} picked up`, body: `Your order has been picked up.`, data: { orderId: order._id, type: 'order_picked_up' } });
        try { const io2 = req.app.get('io'); if (io2) io2.to(`user:${order.user}`).emit('notification', note); } catch (e) { /* ignore */ }
      }
    } catch (e) { console.warn('visitStop: notification failed', e && e.message); }

    return res.status(200).json({ message: 'Stop marked visited', order, stopIndex: idx });
  } catch (e) {
    console.error('visitStop error', e);
    return res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/orders/:id/deliver - mark order delivered by driver
exports.deliverOrder = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });
    if (req.user.role !== 'driver') return res.status(403).json({ message: 'Forbidden' });

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    // verify assignment
    let driverDoc = null;
    if (req.user && req.user._id) driverDoc = await Driver.findOne({ user: req.user._id });
    if (!driverDoc && req.user.phone) driverDoc = await Driver.findOne({ phone: req.user.phone });
    if (!driverDoc) return res.status(403).json({ message: 'Driver profile not found' });
    if (!order.driver || String(order.driver) !== String(driverDoc._id)) return res.status(403).json({ message: 'Not assigned to you' });

    order.status = 'delivered';
    await order.save();

    // Remove order from driver's assignedOrders
    try {
      await Driver.findByIdAndUpdate(order.driver, { $pull: { assignedOrders: order._id }, $unset: { currentAssignedOrder: 1 } }).exec();
    } catch (e) { console.warn('deliverOrder: failed to cleanup driver assignedOrders', e && e.message); }

    // If this is a new transition to delivered, increment the driver's trip counter on the linked User
    try {
      if (prevStatus !== 'delivered' && order.driver) {
        try {
          const drv = await Driver.findById(order.driver).lean();
          const driverUserId = drv && drv.user ? drv.user : null;
          if (driverUserId) {
            const updatedUser = await User.findByIdAndUpdate(driverUserId, { $inc: { 'driverProfile.trips': 1 } }, { new: true }).exec();
            try {
              const io3 = req.app.get('io');
              if (io3) {
                io3.to(`user:${driverUserId}`).emit('driverUpdated', { userId: String(driverUserId), driverId: String(order.driver), driverProfile: updatedUser ? updatedUser.driverProfile : null });
                // also notify order room so pages showing this order can refresh driver info
                io3.to(`order:${order._id}`).emit('driverUpdated', { userId: String(driverUserId), driverId: String(order.driver), driverProfile: updatedUser ? updatedUser.driverProfile : null });
              }
            } catch (e) { /* ignore emit errors */ }
          }
        } catch (e) {
          console.warn('deliverOrder: failed to increment driver trips', e && e.message);
        }
      }
    } catch (e) { console.warn('deliverOrder: trips update failed', e && e.message); }

    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`order:${order._id}`).emit('orderUpdate', { action: 'delivered', orderId: order._id, order });
        io.to(`user:${order.user}`).emit('orderUpdate', { action: 'delivered', orderId: order._id, order });
        io.to(`order:${order._id}`).emit('orderAssigned', { orderId: order._id, assignedTo: null });
        io.to(`user:${order.user}`).emit('orderAssigned', { orderId: order._id, assignedTo: null });
      }
    } catch (e) { console.warn('deliverOrder: socket emit failed', e && e.message); }

    // Persist and emit notifications: customer, vendors, and driver
    try {
      const io2 = req.app.get('io');
      // notify customer
      try {
        const note = await Notification.create({ user: order.user, title: `Order ${order._id.toString().slice(-6).toUpperCase()} delivered`, body: `Your order has been delivered.`, data: { orderId: order._id, type: 'delivered' } });
        try { if (io2) io2.to(`user:${order.user}`).emit('notification', note); } catch (e) {}
      } catch (e) { console.warn('deliverOrder: customer notification failed', e && e.message); }

      // collect vendor ids
      const vendorIds = new Set();
      if (order.vendorAddresses && order.vendorAddresses.length > 0) {
        order.vendorAddresses.forEach(a => { if (a && a.vendor) vendorIds.add(String(a.vendor)); });
      }
      if (order.vendorAddress && order.vendorAddress.vendor) vendorIds.add(String(order.vendorAddress.vendor));
      if ((vendorIds.size === 0) && Array.isArray(order.items)) {
        order.items.forEach(it => { if (it && it.vendor) vendorIds.add(String(it.vendor)); });
      }

      // notify each vendor (persisted note + socket emit)
      for (const vid of Array.from(vendorIds)) {
        try {
          const vnote = await Notification.create({ user: vid, title: `Order ${order._id.toString().slice(-6).toUpperCase()} delivered`, body: `An order including your items was delivered.`, data: { orderId: order._id, type: 'vendor_order_delivered', vendor: vid } });
          try { if (io2) io2.to(`user:${vid}`).emit('notification', vnote); } catch (e) {}
        } catch (e) { console.warn('deliverOrder: vendor notification failed for vendor', vid, e && e.message); }
      }

      // notify driver (persisted note + socket emit) if assigned
      try {
        if (order.driver) {
          const driverDoc = await Driver.findById(order.driver).exec();
          const driverUserId = driverDoc && driverDoc.user ? driverDoc.user : null;
          if (driverUserId) {
            const dnote = await Notification.create({ user: driverUserId, title: `Order ${order._id.toString().slice(-6).toUpperCase()} delivered`, body: `The order you delivered has been marked delivered.`, data: { orderId: order._id, type: 'driver_order_delivered', driver: driverUserId } });
            try { if (io2) io2.to(`user:${driverUserId}`).emit('notification', dnote); } catch (e) {}
          }
        }
      } catch (e) { console.warn('deliverOrder: driver notification failed', e && e.message); }
    } catch (e) { console.warn('deliverOrder: notification radiate failed', e && e.message); }

    return res.status(200).json({ message: 'Order delivered', order });
  } catch (e) {
    console.error('deliverOrder error', e);
    return res.status(500).json({ message: 'Server error' });
  }
};

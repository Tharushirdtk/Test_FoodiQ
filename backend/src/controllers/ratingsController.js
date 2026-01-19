const Review = require('../models/Review');
const User = require('../models/User');
const Order = require('../models/Order');
const mongoose = require('mongoose');
const Driver = require('../models/Driver');

// Helper: recompute aggregated driver rating and persist to the linked User.driverProfile
const persistDriverRatingForEntity = async (entityId) => {
  try {
    // Resolve whether entityId is a Driver._id or a User._id
    let driverDoc = null;
    let targetUserId = null;
    try { driverDoc = await Driver.findById(entityId).lean(); } catch (e) { /* ignore */ }
    if (driverDoc && driverDoc.user) {
      targetUserId = String(driverDoc.user);
    } else {
      // treat as user id
      targetUserId = String(entityId);
      // attempt to find driver doc for that user
      try { driverDoc = await Driver.findOne({ user: targetUserId }).lean(); } catch (e) { /* ignore */ }
    }

    // Build candidate ids for aggregation (driver._id and the user id)
    const candidateIds = [];
    try { if (driverDoc && driverDoc._id) candidateIds.push(mongoose.Types.ObjectId(driverDoc._id)); } catch (e) {}
    try { if (targetUserId) candidateIds.push(mongoose.Types.ObjectId(targetUserId)); } catch (e) {}
    if (candidateIds.length === 0) return null;

    const agg = await Review.aggregate([
      { $match: { entityType: 'driver', entityId: { $in: candidateIds } } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }
    ]);

    const avg = (agg && agg.length && typeof agg[0].avg === 'number') ? Number((agg[0].avg).toFixed(1)) : 0;

    // persist to User.driverProfile.rating if we have a user id
    if (targetUserId) {
      const updated = await User.findByIdAndUpdate(targetUserId, { $set: { 'driverProfile.rating': avg } }, { new: true }).exec();
      try {
        const io = require('http').Server ? null : null; // noop placeholder
      } catch (e) {}
      try {
        // emit socket event if available via global app - consumers can listen on user:<id> or driver:<id>
        // We can't access `req` here, so expect callers to emit where req is available. Return the updated user.
        return updated;
      } catch (e) { return updated; }
    }
    return null;
  } catch (e) {
    console.warn('persistDriverRatingForEntity failed', e && e.message);
    return null;
  }
};

// GET /api/ratings?entityType=vendor&entityId=...&page=1&pageSize=5
exports.getRatings = async (req, res) => {
  try {
    const { entityType, entityId, page = 1, pageSize = 5 } = req.query;
    if (!entityType || !entityId) return res.status(400).json({ message: 'entityType and entityId are required' });
    const pg = Math.max(1, parseInt(page));
    const ps = Math.max(1, Math.min(100, parseInt(pageSize)));
    const query = { entityType: entityType, entityId: new mongoose.Types.ObjectId(entityId) };
    const total = await Review.countDocuments(query);
    // sort by most-recent activity (updatedAt) so edits surface to top
    const reviews = await Review.find(query).populate('user', 'name displayName avatar').sort({ updatedAt: -1, createdAt: -1 }).skip((pg - 1) * ps).limit(ps);
    // compute whether current user can rate this entity
    let canRate = false;
    let canRateOrderId = null;
    try {
      const userId = req.user && req.user._id;
      if (userId) {
        // check if user already has a review for this entity
        const existing = await Review.findOne({ entityType, entityId: new mongoose.Types.ObjectId(entityId), user: userId });
        const Order = require('../models/Order');
        // helpers: treat these statuses as completed
        const COMPLETED_STATUSES = ['delivered', 'picked_up_my_order', 'completed'];
        const isDeliveredMatch = { status: { $in: COMPLETED_STATUSES } };

        // Always attempt to find a qualifying completed order so we can return an order id
        // even when an existing review is present (frontend needs an orderId to submit/update reviews).
        if (entityType === 'vendor') {
          const custOrder = await Order.findOne({ user: userId, ...isDeliveredMatch, $or: [ { 'vendorAddresses.vendor': entityId }, { 'vendorAddress.vendor': entityId } ] });
          if (custOrder) { canRateOrderId = String(custOrder._id); }

          // drivers assigned to a completed order can rate vendors
          if (!canRateOrderId && req.user && req.user.role === 'driver') {
            const Driver = require('../models/Driver');
            let driverDoc = null;
            if (req.user && req.user._id) driverDoc = await Driver.findOne({ user: req.user._id });
            if (!driverDoc && req.user.phone) driverDoc = await Driver.findOne({ phone: req.user.phone });
            if (driverDoc) {
              const drvOrder = await Order.findOne({ driver: driverDoc._id, ...isDeliveredMatch, $or: [ { 'vendorAddresses.vendor': entityId }, { 'vendorAddress.vendor': entityId } ] });
              if (drvOrder) { canRateOrderId = String(drvOrder._id); }
            }
          }
        } else if (entityType === 'driver') {
          const custOrder = await Order.findOne({ user: userId, ...isDeliveredMatch, driver: new mongoose.Types.ObjectId(entityId) });
          if (custOrder) { canRateOrderId = String(custOrder._id); }
        } else if (entityType === 'product') {
          const prodOrder = await Order.findOne({ user: userId, ...isDeliveredMatch, 'items.product': new mongoose.Types.ObjectId(entityId) });
          if (prodOrder) { canRateOrderId = String(prodOrder._id); }
        }

        // Now determine if user may create a new rating (no existing review and an order exists)
        if (!existing && canRateOrderId) {
          canRate = true;
        }
      }
    } catch (e) {
      console.warn('ratings.getRatings canRate check failed', e);
    }

    return res.json({ reviews, pagination: { page: pg, pageSize: ps, total, pages: Math.ceil(total / ps) }, canRate, canRateOrderId });
  } catch (e) {
    console.error('ratings.getRatings error', e && (e.stack || e));
    return res.status(500).json({ message: e && e.message ? e.message : 'Server error' });
  }
};

// POST /api/ratings { entityType, entityId, rating, text }
exports.addRating = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });
    const { entityType, entityId, rating, text } = req.body;
    if (!entityType || !entityId) return res.status(400).json({ message: 'entityType and entityId required' });
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ message: 'rating must be between 1 and 5' });

    // Require an orderId to gate ratings so users cannot submit arbitrary ratings from modals.
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ message: 'orderId is required to submit a rating' });

    // Verify order exists and is completed (delivered or picked_up_my_order)
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const completedStatuses = ['delivered', 'picked_up_my_order', 'completed'];
    if (!order.status || !completedStatuses.includes(String(order.status))) {
      return res.status(400).json({ message: 'Ratings can only be submitted for completed orders' });
    }

    // Ensure the entity being rated participated in the order
    let permitted = false;
    // Customers who placed the order can rate involved vendors and driver
    if (order.user && String(order.user) === String(userId)) {
      if (entityType === 'driver' && order.driver && String(order.driver) === String(entityId)) permitted = true;
      if (entityType === 'vendor') {
        if (Array.isArray(order.vendorAddresses)) {
          for (const v of order.vendorAddresses) {
            if (v && v.vendor && String(v.vendor) === String(entityId)) { permitted = true; break; }
          }
        }
        if (!permitted && order.vendorAddress && order.vendorAddress.vendor && String(order.vendorAddress.vendor) === String(entityId)) permitted = true;
      }
    }

    // Customers who ordered a product can rate that product
    if (!permitted && order.user && String(order.user) === String(userId) && entityType === 'product') {
      if (Array.isArray(order.items)) {
        for (const it of order.items) {
          if (it && it.product && String(it.product) === String(entityId)) { permitted = true; break; }
        }
      }
    }

    // Drivers assigned to the order can rate vendors involved in the order
    if (!permitted && req.user && req.user.role === 'driver') {
      try {
        const Driver = require('../models/Driver');
        let driverDoc = null;
        if (req.user && req.user._id) driverDoc = await Driver.findOne({ user: req.user._id });
        if (!driverDoc && req.user.phone) driverDoc = await Driver.findOne({ phone: req.user.phone });
        if (driverDoc && order.driver && String(order.driver) === String(driverDoc._id)) {
          if (entityType === 'vendor') {
            if (Array.isArray(order.vendorAddresses)) {
              for (const v of order.vendorAddresses) {
                if (v && v.vendor && String(v.vendor) === String(entityId)) { permitted = true; break; }
              }
            }
            if (!permitted && order.vendorAddress && order.vendorAddress.vendor && String(order.vendorAddress.vendor) === String(entityId)) permitted = true;
          }
            // drivers can also be rated by vendors via vendor UI (handled elsewhere), drivers themselves don't rate products here
        }
      } catch (e) { /* ignore driver resolution errors */ }
    }

    // Vendors who are part of the order can rate the driver
    if (!permitted && req.user && req.user.role === 'vendor' && entityType === 'driver') {
      try {
        const vendorId = req.user._id;
        // check if this vendor is listed on the order
        let vendorInOrder = false;
        if (Array.isArray(order.vendorAddresses)) {
          for (const v of order.vendorAddresses) {
            if (v && v.vendor && String(v.vendor) === String(vendorId)) { vendorInOrder = true; break; }
          }
        }
        if (!vendorInOrder && order.vendorAddress && order.vendorAddress.vendor && String(order.vendorAddress.vendor) === String(vendorId)) vendorInOrder = true;
        if (vendorInOrder && order.driver && String(order.driver) === String(entityId)) permitted = true;
      } catch (e) { /* ignore */ }
    }

    if (!permitted) return res.status(403).json({ message: 'You are not permitted to rate this entity for the specified order' });

    // prevent duplicate: one rating per user per entity
    let existing = await Review.findOne({ entityType, entityId, user: userId });
    if (existing) {
      existing.rating = Number(rating);
      existing.text = text || existing.text;
      await existing.save();
      // recompute driver rating if applicable and emit socket
      try {
        const updatedUser = await persistDriverRatingForEntity(entityId);
        try { const io = req.app.get('io'); if (io && updatedUser) { io.to(`user:${String(updatedUser._id)}`).emit('driverUpdated', { userId: String(updatedUser._id), driverProfile: updatedUser.driverProfile }); } } catch (e) {}
      } catch (e) { /* ignore */ }
      return res.json(existing);
    }

    const newR = await Review.create({ entityType, entityId, user: userId, rating: Number(rating), text });
    // recompute driver rating if this is a driver rating
    try {
      const updatedUser = await persistDriverRatingForEntity(entityId);
      try { const io = req.app.get('io'); if (io && updatedUser) { io.to(`user:${String(updatedUser._id)}`).emit('driverUpdated', { userId: String(updatedUser._id), driverProfile: updatedUser.driverProfile }); } } catch (e) {}
    } catch (e) { /* ignore */ }
    return res.status(201).json(newR);
  } catch (e) {
    console.error('ratings.addRating error', e);
    return res.status(500).json({ message: 'Server error' });
  }
};

// DELETE /api/ratings/:id
exports.deleteRating = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });
    const id = req.params.id;
    if (!id) return res.status(400).json({ message: 'Rating id required' });
    const rev = await Review.findById(id);
    if (!rev) return res.status(404).json({ message: 'Rating not found' });
    // allow owner or admin to delete
    if (String(rev.user) !== String(userId) && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }
    await Review.deleteOne({ _id: id });
    // recompute driver rating for the entity the deleted review referenced (if driver)
    try {
      // attempt to recompute by inspecting deleted review entity (rev)
      if (rev && rev.entityType === 'driver' && rev.entityId) {
        const updatedUser = await persistDriverRatingForEntity(String(rev.entityId));
        try { const io = req.app.get('io'); if (io && updatedUser) { io.to(`user:${String(updatedUser._id)}`).emit('driverUpdated', { userId: String(updatedUser._id), driverProfile: updatedUser.driverProfile }); } } catch (e) {}
      }
    } catch (e) { /* ignore */ }
    return res.json({ message: 'Deleted' });
  } catch (e) {
    console.error('ratings.deleteRating error', e);
    return res.status(500).json({ message: 'Server error' });
  }
};

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const Driver = require('../models/Driver');
const Review = require('../models/Review');
const Order = require('../models/Order');
const { protect } = require('../middleware/auth');



// Public: get basic user info (used for vendor/driver public profiles)
router.get('/:id', async (req, res) => {
  try {
    // Try to resolve the id as a User first. If not found, it may be a Driver id
    // (frontend sometimes passes driver._id). In that case load the Driver
    // and then fetch the associated User document.
    let u = await User.findById(req.params.id).select('-password -email -phoneVerificationTokens');
    if (!u) {
      // attempt to treat id as Driver._id
      try {
        const drv = await Driver.findById(req.params.id).lean();
        if (drv && drv.user) {
          u = await User.findById(drv.user).select('-password -email -phoneVerificationTokens');
        }
      } catch (e) {
        // ignore driver lookup errors and fall through to not found
      }
    }
    if (!u) return res.status(404).json({ message: 'User not found' });
    // return a safe public shape (exclude any driverProfile.location that may exist in DB)
    const safeDriverProfile = u.driverProfile
      ? {
          vehicleType: u.driverProfile.vehicleType || null,
          // hide vehicleNumber if it appears to be a bcrypt hash
          vehicleNumber: (typeof u.driverProfile.vehicleNumber === 'string' && u.driverProfile.vehicleNumber.startsWith('$2')) ? null : (u.driverProfile.vehicleNumber || null),
          vehicleImage: u.driverProfile.vehicleImage || null,
          licenseNumber: u.driverProfile.licenseNumber || null,
          // rating will be computed below (0 when no ratings)
          rating: 0,
          active: typeof u.driverProfile.active !== 'undefined' ? u.driverProfile.active : false,
          assignedOrders: Array.isArray(u.driverProfile.assignedOrders) ? u.driverProfile.assignedOrders : [],
          trips: 0,
        }
      : null;

    // compute aggregated rating and completed trips for drivers (override defaults)
    try {
      // collect candidate ids that may be used in reviews/orders: the incoming id, the user._id and any Driver._id linked to the user
      const candidateIds = new Set();
      try { candidateIds.add(String(req.params.id)); } catch (e) {}
      try { candidateIds.add(String(u._id)); } catch (e) {}
      const drvDoc = await Driver.findOne({ user: u._id }).lean();
      if (drvDoc && drvDoc._id) candidateIds.add(String(drvDoc._id));

      const idArr = Array.from(candidateIds).filter(Boolean).map(id => mongoose.Types.ObjectId(id));

      if (idArr.length) {
        const agg = await Review.aggregate([
          { $match: { entityType: 'driver', entityId: { $in: idArr } } },
          { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }
        ]);
        if (agg && agg.length) {
          safeDriverProfile.rating = typeof agg[0].avg === 'number' ? Number((agg[0].avg).toFixed(1)) : 0;
        } else {
          safeDriverProfile.rating = 0;
        }

        const COMPLETED_STATUSES = ['delivered', 'picked_up_my_order', 'completed'];
        const tripsCount = await Order.countDocuments({ driver: { $in: idArr }, status: { $in: COMPLETED_STATUSES } });
        safeDriverProfile.trips = Number(tripsCount || 0);
      }
    } catch (e) {
      console.warn('users.get: failed to compute driver aggregates', e && e.message);
    }

    // return a safe public shape
    const out = {
      _id: u._id,
      name: u.name,
      displayName: u.displayName,
      avatar: u.avatar,
      vendorProfile: u.vendorProfile || null,
      driverProfile: safeDriverProfile,
    };
    return res.json({ user: out });
  } catch (e) {
    console.error('users.get public', e && e.message);
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

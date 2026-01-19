const express = require('express');
const router = express.Router();
const { getVendorOrders } = require('../controllers/vendorController');
const { protect, requireRole } = require('../middleware/auth');

// allow vendor owners and admins to fetch vendor orders; protect for authenticated users
router.get('/:id/orders', protect, getVendorOrders);

module.exports = router;

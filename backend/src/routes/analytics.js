const express = require('express');
const router = express.Router();
const { getRevenueSeries } = require('../controllers/analyticsController');
const { protect, requireRole } = require('../middleware/auth');

// Public (aggregated) endpoints could be protected for admin only; allow vendor/driver to fetch their own series
router.get('/revenue', protect, getRevenueSeries);

module.exports = router;

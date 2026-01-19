const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/auth');
const driverController = require('../controllers/driverController');

// Only drivers can access their own info, but allow users to get driver for their order
router.get('/:id', protect, requireRole(['driver', 'admin']), driverController.getDriver);
router.get('/order/:orderId', protect, driverController.getDriverForOrder);

module.exports = router;

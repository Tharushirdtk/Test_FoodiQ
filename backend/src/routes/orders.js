const express = require('express');
const router = express.Router();
const { createOrder, getOrders, getOrder, cancelOrder, updateOrderStatus, assignOrder, startDelivery, visitStop, deliverOrder, vendorPrepare, vendorReady } = require('../controllers/orderController');
const { protect, requireRole } = require('../middleware/auth');

router.post('/', protect, createOrder);
router.post('/:id/confirm-pickup', protect, require('./../controllers/orderController').confirmPickup);
router.post('/:id/complete', protect, require('./../controllers/orderController').completeOrder);
router.get('/', protect, getOrders);
// driver-specific quick endpoints
router.get('/available', protect, requireRole(['driver','support','admin']), require('./../controllers/orderController').getAvailableOrders);
router.get('/driver/history', protect, requireRole(['driver','admin']), require('./../controllers/orderController').getDriverHistory);
router.get('/export', protect, requireRole(['admin','vendor','driver','support','customer']), require('./../controllers/orderController').exportOrdersCsv);
router.get('/assigned', protect, getOrders);
router.get('/:id', protect, getOrder);
router.put('/:id/cancel', protect, cancelOrder);
router.put('/:id/status', protect, updateOrderStatus);
router.post('/:id/assign', protect, requireRole(['driver']), assignOrder);
router.post('/:id/start', protect, requireRole(['driver']), startDelivery);
router.post('/:id/stop/:index/visit', protect, requireRole(['driver']), visitStop);
router.post('/:id/vendor/:vendorId/picked', protect, requireRole(['vendor']), require('./../controllers/orderController').vendorPicked);
router.post('/:id/deliver', protect, requireRole(['driver']), deliverOrder);
// Vendor actions: mark vendor stop as preparing or ready
router.post('/:id/vendor/:vendorId/prepare', protect, requireRole(['vendor']), vendorPrepare);
router.post('/:id/vendor/:vendorId/ready', protect, requireRole(['vendor']), vendorReady);
router.post('/:id/unassign', protect, require('./../controllers/orderController').unassignOrder);

module.exports = router;

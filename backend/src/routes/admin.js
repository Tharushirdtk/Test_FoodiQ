const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const adminStatsController = require('../controllers/adminStatsController');
const { protect, requireRole } = require('../middleware/auth');

// All routes require admin
router.use(protect, requireRole('admin'));

router.get('/users', adminController.listUsers);
router.get('/users/:id', adminController.getUser);
router.post('/users', adminController.createUser);
router.put('/users/:id', adminController.updateUser);
router.delete('/users/:id', adminController.deleteUser);

// Admin dashboard stats
router.get('/stats', adminStatsController.getStats);

// Export orders CSV with optional vendorId, from, to query params
router.get('/orders/export', adminController.exportOrdersCsv);

module.exports = router;

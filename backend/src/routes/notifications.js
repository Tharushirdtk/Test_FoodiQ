const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  getNotifications,
  createNotification,
  markRead,
  markAllRead,
  deleteNotification
} = require('../controllers/notificationsController');

router.get('/', protect, getNotifications);
router.post('/', protect, createNotification);
router.put('/:id/read', protect, markRead);
router.put('/readAll', protect, markAllRead);
router.delete('/:id', protect, deleteNotification);

module.exports = router;

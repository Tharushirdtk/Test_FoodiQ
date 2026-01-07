const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const User = require('../models/User');

// @route   GET /api/preferences
// @desc    Get user preferences
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('preferences');
    res.json(user.preferences || { darkMode: false, pushNotifications: true });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/preferences
// @desc    Update user preferences
// @access  Private
router.put('/', protect, async (req, res) => {
  try {
    const { darkMode, pushNotifications } = req.body;
    
    const updateData = {};
    if (typeof darkMode === 'boolean') updateData['preferences.darkMode'] = darkMode;
    if (typeof pushNotifications === 'boolean') updateData['preferences.pushNotifications'] = pushNotifications;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updateData },
      { new: true }
    ).select('preferences');

    res.json(user.preferences);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/preferences/notifications
// @desc    Get user notifications
// @access  Private
router.get('/notifications', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('notifications');
    res.json(user.notifications || []);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/preferences/notifications/:id/read
// @desc    Mark notification as read
// @access  Private
router.put('/notifications/:id/read', protect, async (req, res) => {
  try {
    await User.updateOne(
      { _id: req.user.id, 'notifications._id': req.params.id },
      { $set: { 'notifications.$.read': true } }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/preferences/notifications/read-all
// @desc    Mark all notifications as read
// @access  Private
router.put('/notifications/read-all', protect, async (req, res) => {
  try {
    await User.updateOne(
      { _id: req.user.id },
      { $set: { 'notifications.$[].read': true } }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/preferences/notifications/:id
// @desc    Delete a notification
// @access  Private
router.delete('/notifications/:id', protect, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, {
      $pull: { notifications: { _id: req.params.id } }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/preferences/notifications
// @desc    Clear all notifications
// @access  Private
router.delete('/notifications', protect, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, {
      $set: { notifications: [] }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

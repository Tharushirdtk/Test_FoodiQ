const Notification = require('../models/Notification');
const User = require('../models/User');

// GET /api/notifications - list notifications for current user
exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });

    const notes = await Notification.find({ user: userId }).sort({ createdAt: -1 });
    return res.status(200).json(notes);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/notifications - create a notification (for testing/internal use)
exports.createNotification = async (req, res) => {
  try {
    // allow creating for a specific userId, otherwise for the authenticated user
    const actorId = req.user && req.user._id;
    if (!actorId) return res.status(401).json({ message: 'Not authorized' });

    const { userId, title, body, data } = req.body;
    if (!title) return res.status(400).json({ message: 'title is required' });

    const targetUser = userId || actorId;
    const user = await User.findById(targetUser);
    if (!user) return res.status(404).json({ message: 'Target user not found' });

    const note = await Notification.create({ user: targetUser, title, body, data: data || {} });

    // Emit socket event to the user
    try {
      const io = req.app.get('io');
      if (io) io.to(`user:${targetUser}`).emit('notification', note);
    } catch (e) { console.warn('Socket notify failed', e.message); }

    return res.status(201).json(note);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// PUT /api/notifications/:id/read - mark single as read
exports.markRead = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });

    const note = await Notification.findById(req.params.id);
    if (!note) return res.status(404).json({ message: 'Notification not found' });
    if (note.user.toString() !== userId.toString()) return res.status(403).json({ message: 'Forbidden' });

    note.read = true;
    await note.save();
    return res.status(200).json(note);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// PUT /api/notifications/readAll - mark all as read for current user
exports.markAllRead = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });

    const result = await Notification.updateMany({ user: userId, read: false }, { $set: { read: true } });
    return res.status(200).json({ modifiedCount: result.modifiedCount || result.nModified || 0 });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// DELETE /api/notifications/:id - delete a notification
exports.deleteNotification = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });

    const note = await Notification.findById(req.params.id);
    if (!note) return res.status(404).json({ message: 'Notification not found' });
    if (note.user.toString() !== userId.toString()) return res.status(403).json({ message: 'Forbidden' });

    // Use deleteOne to avoid relying on document instance methods that may not exist
    const result = await Notification.deleteOne({ _id: note._id });
    if (result.deletedCount === 0) {
      return res.status(500).json({ message: 'Failed to delete notification' });
    }
    return res.status(200).json({ message: 'Deleted' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

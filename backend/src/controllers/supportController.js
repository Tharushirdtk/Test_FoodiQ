const SupportTicket = require('../models/SupportTicket');
const Order = require('../models/Order');

// POST /api/support/tickets { subject, message, orderId? }
exports.createTicket = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });

    const { subject, message, orderId } = req.body;
    if (!subject || !message) return res.status(400).json({ message: 'subject and message are required' });

    if (orderId) {
      const order = await Order.findById(orderId);
      if (!order) return res.status(404).json({ message: 'Order not found' });
      if (order.user.toString() !== userId.toString()) return res.status(403).json({ message: 'Forbidden' });
    }

    const ticket = await SupportTicket.create({ user: userId, subject, message, order: orderId });
    return res.status(201).json(ticket);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

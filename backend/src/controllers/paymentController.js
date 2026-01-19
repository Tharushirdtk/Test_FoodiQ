const crypto = require('crypto');
const Order = require('../models/Order');

// POST /api/payments/create-intent
// Creates a mock payment intent (clientSecret) for an order or a raw amount.
// If STRIPE integration is added later, this function can be extended.
exports.createPaymentIntent = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });

    const { orderId, amount } = req.body;

    let totalAmount = 0;
    let order = null;

    if (orderId) {
      order = await Order.findById(orderId);
      if (!order) return res.status(404).json({ message: 'Order not found' });
      if (order.user.toString() !== userId.toString()) return res.status(403).json({ message: 'Forbidden' });

      totalAmount = order.items.reduce((s, it) => s + (it.price || 0) * (it.quantity || 1), 0);
    } else {
      if (!amount) return res.status(400).json({ message: 'amount or orderId is required' });
      totalAmount = Number(amount);
    }

    // Generate a mock client secret
    const clientSecret = crypto.randomBytes(32).toString('hex');

    // Attach to order if present - preserve any existing payment.method/cardId
    if (order) {
      order.payment = order.payment || {};
      order.payment.status = 'requires_payment';
      order.payment.provider = process.env.PAYMENT_PROVIDER || 'mock';
      order.payment.providerResponse = { clientSecret, amount: totalAmount };
      // do not clobber order.payment.method or order.payment.cardId if already set
      await order.save();
    }

    return res.status(200).json({ clientSecret, amount: totalAmount, provider: process.env.PAYMENT_PROVIDER || 'mock' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/payments/webhook
// Basic webhook endpoint that accepts events like { orderId, event: 'payment_succeeded'|'payment_failed', providerPaymentId }
// Note: For real providers (Stripe/PayPal) implement signature verification and raw body handling.
exports.handleWebhook = async (req, res) => {
  try {
    const payload = req.body || {};
    const { orderId, event, providerPaymentId } = payload;

    if (!orderId || !event) return res.status(400).json({ message: 'orderId and event are required' });

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (event === 'payment_succeeded') {
      order.payment = order.payment || {};
      order.payment.status = 'succeeded';
      order.payment.providerResponse = { ...(order.payment.providerResponse || {}), providerPaymentId };
      order.status = 'processing';
    } else if (event === 'payment_failed') {
      order.payment = order.payment || {};
      order.payment.status = 'failed';
      order.payment.providerResponse = { ...(order.payment.providerResponse || {}), providerPaymentId };
      order.status = 'payment_failed';
    } else {
      return res.status(400).json({ message: 'Unknown event type' });
    }

    await order.save();

    try {
      const io = req.app.get('io');
      if (io) {
        // Notify order owner and any listeners of this order
        io.to(`user:${order.user}`).emit('orderUpdate', { action: 'payment', orderId: order._id, status: order.status });
        io.to(`order:${order._id}`).emit('orderUpdate', { action: 'payment', orderId: order._id, status: order.status });
      }
    } catch (e) { console.warn('Socket emit failed', e); }

    return res.status(200).json({ message: 'Webhook processed' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

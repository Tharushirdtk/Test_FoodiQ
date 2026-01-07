const Order = require('../models/Order');
const CartItem = require('../models/CartItem');
const Address = require('../models/Address');
const Product = require('../models/Product');
const User = require('../models/User');
const { sendOrderReceiptEmail } = require('../utils/mailer');
const Notification = require('../models/Notification');

// POST /api/orders - create an order from user's cart or provided items
exports.createOrder = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });

    const { addressId, payment, items: providedItems } = req.body;

    // Determine items: use provided items or the user's cart
    let cartItems = [];
    if (Array.isArray(providedItems) && providedItems.length > 0) {
      // expected providedItems: [{ productId, quantity, options }]
      for (const it of providedItems) {
        const prod = await Product.findById(it.productId);
        if (!prod) return res.status(404).json({ message: `Product ${it.productId} not found` });
        cartItems.push({ product: prod._id, name: prod.name, price: prod.price, quantity: Number(it.quantity) || 1, options: it.options || {} });
      }
    } else {
      const dbCart = await CartItem.find({ user: userId }).populate('product');
      if (!dbCart || dbCart.length === 0) return res.status(400).json({ message: 'Cart is empty' });
      cartItems = dbCart.map(ci => ({ product: ci.product._id, name: ci.product.name, price: ci.product.price, quantity: ci.quantity, options: ci.options || {} }));
    }

    // Resolve address
    let addressObj = null;
    if (addressId) {
      const addr = await Address.findById(addressId);
      if (!addr) return res.status(404).json({ message: 'Address not found' });
      if (addr.user.toString() !== userId.toString()) return res.status(403).json({ message: 'Forbidden' });
      addressObj = { type: addr.type, street: addr.street, city: addr.city, zip: addr.zip };
    } else if (req.body.address) {
      const a = req.body.address;
      const zip = a.zip || a.postalCode;
      if (!a.street || !a.city || !zip) return res.status(400).json({ message: 'Address incomplete' });
      addressObj = { type: a.type || a.label || 'Home', street: a.street, city: a.city, zip: zip };
    } else {
      return res.status(400).json({ message: 'Address is required' });
    }

    // Calculate totals
    const subtotal = cartItems.reduce((s, it) => s + (it.price || 0) * (it.quantity || 1), 0);

    const order = await Order.create({
      user: userId,
      items: cartItems,
      address: addressObj,
      payment: { status: payment && payment.status ? payment.status : 'pending', provider: payment && payment.provider },
      status: 'confirmed'
    });

    // Clear user's cart
    await CartItem.deleteMany({ user: userId });

    // Send order receipt email
    try {
      const user = await User.findById(userId);
      if (user && user.email) {
        await sendOrderReceiptEmail(user, order);
      }
    } catch (e) { console.warn('Failed to send order receipt email', e); }

    // Emit socket update to owner and order room
    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`user:${userId}`).emit('orderUpdate', { action: 'create', orderId: order._id, order });
        io.to(`order:${order._id}`).emit('orderUpdate', { action: 'create', orderId: order._id, order });
      }
    } catch (e) { console.warn('Socket emit failed', e); }

    // Persist notification for user
    try {
      const note = await Notification.create({
        user: userId,
        title: `Order ${order._id?.toString().slice(-6).toUpperCase()} confirmed`,
        body: `Your order has been placed and confirmed.`,
        data: { orderId: order._id, type: 'order_created' }
      });
      try {
        const io2 = req.app.get('io');
        if (io2) io2.to(`user:${userId}`).emit('notification', note);
      } catch (e) { /* ignore socket notify failure */ }
    } catch (e) { console.warn('Failed to create notification', e.message); }

    return res.status(201).json({ orderId: order._id, order });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/orders - list user's orders
exports.getOrders = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });

    const orders = await Order.find({ user: userId }).sort({ createdAt: -1 });
    return res.status(200).json(orders);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/orders/:id - get order details
exports.getOrder = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.user.toString() !== userId.toString()) return res.status(403).json({ message: 'Forbidden' });

    return res.status(200).json(order);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// PUT /api/orders/:id/cancel - cancel order
exports.cancelOrder = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.user.toString() !== userId.toString()) return res.status(403).json({ message: 'Forbidden' });

    if (['delivered','cancelled'].includes(order.status)) {
      return res.status(400).json({ message: `Cannot cancel order with status ${order.status}` });
    }

    order.status = 'cancelled';
    await order.save();

    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`user:${userId}`).emit('orderUpdate', { action: 'cancel', orderId: order._id, order });
        io.to(`order:${order._id}`).emit('orderUpdate', { action: 'cancel', orderId: order._id, order });
      }
    } catch (e) { console.warn('Socket emit failed', e); }

    // Persist notification for cancellation
    try {
      const note = await Notification.create({
        user: userId,
        title: `Order ${order._id?.toString().slice(-6).toUpperCase()} cancelled`,
        body: `Your order has been cancelled.`,
        data: { orderId: order._id, type: 'order_cancelled' }
      });
      try {
        const io2 = req.app.get('io');
        if (io2) io2.to(`user:${userId}`).emit('notification', note);
      } catch (e) { /* ignore socket notify failure */ }
    } catch (e) { console.warn('Failed to create notification', e.message); }

    return res.status(200).json({ message: 'Order cancelled', order });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

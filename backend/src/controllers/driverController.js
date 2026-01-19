const Driver = require('../models/Driver');
const Order = require('../models/Order');

exports.getDriver = async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id);
    if (!driver) return res.status(404).json({ message: 'Driver not found' });
    return res.json(driver);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getDriverForOrder = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    console.debug('[driverController] getDriverForOrder request for orderId=', orderId, 'by user=', req.user && req.user._id);
    // populate driver and the linked user so clients can read user.driverProfile.rating/trips
    const order = await Order.findById(orderId).populate({ path: 'driver', populate: { path: 'user', select: 'name displayName avatar driverProfile' } });
    if (!order) {
      console.warn('[driverController] order not found for id=', orderId);
      return res.status(404).json({ message: 'Order not found' });
    }
    console.debug('[driverController] order.driver=', order.driver ? (order.driver._id || order.driver) : null);
    if (!order.driver) {
      console.info('[driverController] No driver assigned for order', orderId);
      return res.status(404).json({ message: 'No driver assigned' });
    }
    console.debug('[driverController] returning driver for order', orderId, 'driverId=', order.driver._id);
    return res.json(order.driver);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
};

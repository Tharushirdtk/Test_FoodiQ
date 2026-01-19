const User = require('../models/User');
const Order = require('../models/Order');
const Product = require('../models/Product');

exports.getStats = async (req, res) => {
  try {
    const [userCount, orderCount, productCount, vendorCount, driverCount, customerCount, supportCount, revenueAgg] = await Promise.all([
        User.countDocuments(),
        Order.countDocuments(),
        Product.countDocuments(),
        User.countDocuments({ role: 'vendor' }),
        User.countDocuments({ role: 'driver' }),
        User.countDocuments({ role: 'customer' }),
        User.countDocuments({ role: 'support' }),
        Order.aggregate([
          { $match: { status: { $in: ['delivered', 'picked_up_my_order', 'completed'] } } },
          { $group: { _id: null, total: { $sum: "$appCharge" } } }
        ])
      ]);
      const revenue = revenueAgg[0]?.total || 0;
      // Also compute totals for salesTax, platformCut and driverPlatformCut
      const taxAgg = await Order.aggregate([
        { $match: { status: { $in: ['delivered', 'picked_up_my_order', 'completed'] } } },
        { $group: { _id: null, totalSalesTax: { $sum: { $ifNull: ['$salesTax', 0] } }, totalPlatformCut: { $sum: { $ifNull: ['$platformCut', 0] } }, totalDriverPlatformCut: { $sum: { $ifNull: ['$driverPlatformCut', 0] } } } }
      ]);
      const totalSalesTax = taxAgg[0]?.totalSalesTax || 0;
      const totalPlatformCut = taxAgg[0]?.totalPlatformCut || 0;
      const totalDriverPlatformCut = taxAgg[0]?.totalDriverPlatformCut || 0;
      res.json({ userCount, orderCount, productCount, vendorCount, driverCount, customerCount, supportCount, revenue, totalSalesTax, totalPlatformCut, totalDriverPlatformCut });
  } catch (e) {
    res.status(500).json({ message: 'Server error' });
  }
};

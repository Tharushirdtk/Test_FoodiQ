const Order = require('../models/Order');
const mongoose = require('mongoose');

function dateFormatForRange(range) {
  switch (range) {
    case 'daily': return { format: '%Y-%m-%d', groupBy: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } } };
    case 'weekly': return { format: '%G-%V', groupBy: { $dateToString: { format: '%G-%V', date: '$createdAt' } } };
    case 'yearly': return { format: '%Y', groupBy: { $dateToString: { format: '%Y', date: '$createdAt' } } };
    case 'monthly':
    default:
      return { format: '%Y-%m', groupBy: { $dateToString: { format: '%Y-%m', date: '$createdAt' } } };
  }
}

// GET /api/analytics/revenue?entity=driver|vendor|platform&entityId=&range=monthly
exports.getRevenueSeries = async (req, res) => {
  try {
    const { entity = 'platform', entityId, range = 'monthly', interval, from, to } = req.query;
    // prefer `interval` (new name) over legacy `range`
    const rangeToUse = interval || range;
    const fmt = dateFormatForRange(rangeToUse);

    // build base match (date range + completed-like statuses)
    const COMPLETED_STATUSES = ['delivered', 'picked_up_my_order', 'completed'];
    const baseMatch = { status: { $in: COMPLETED_STATUSES } };
    if (from || to) {
      baseMatch.createdAt = {};
      if (from) {
        // parse from as start of day if no time provided
        const fromDate = String(from).includes('T') ? new Date(from) : new Date(String(from) + 'T00:00:00.000Z');
        baseMatch.createdAt.$gte = fromDate;
      }
      if (to) {
        // if to has no time component treat as end of day inclusive
        let toDate;
        if (String(to).includes('T')) {
          toDate = new Date(to);
        } else {
          toDate = new Date(String(to) + 'T00:00:00.000Z');
          toDate = new Date(toDate.getTime() + 24 * 60 * 60 * 1000 - 1);
        }
        baseMatch.createdAt.$lte = toDate;
      }
    }

    if (entity === 'driver') {
      if (!entityId) return res.status(400).json({ message: 'entityId required for driver' });
      const match = { ...baseMatch, driver: new mongoose.Types.ObjectId(entityId) };
      const pipeline = [
        { $match: match },
        { $group: { _id: fmt.groupBy, total: { $sum: { $ifNull: ['$driverRevenue', 0] } }, count: { $sum: 1 } } },
        { $sort: { '_id': 1 } }
      ];
      const rows = await Order.aggregate(pipeline).exec();
      return res.json({ series: rows.map(r => ({ period: r._id, value: r.total, count: r.count })) });
    }

    if (entity === 'vendor') {
      if (!entityId) return res.status(400).json({ message: 'entityId required for vendor' });
      // include baseMatch conditions (createdAt/status) and match vendor after unwind
      const pipeline = [];
      // if there is a createdAt filter, match before unwind to reduce work
      if (baseMatch && baseMatch.createdAt && Object.keys(baseMatch.createdAt).length > 0) {
        pipeline.push({ $match: { status: baseMatch.status, createdAt: baseMatch.createdAt } });
      } else {
        pipeline.push({ $match: baseMatch });
      }
      pipeline.push({ $unwind: '$items' });
      pipeline.push({ $match: { 'items.vendor': new mongoose.Types.ObjectId(entityId) } });
      pipeline.push({ $group: { _id: fmt.groupBy, total: { $sum: { $ifNull: ['$items.vendorRevenue', 0] } }, count: { $sum: 1 } } });
      pipeline.push({ $sort: { '_id': 1 } });
      const rows = await Order.aggregate(pipeline).exec();
      return res.json({ series: rows.map(r => ({ period: r._id, value: r.total, count: r.count })) });
    }

    // platform (default): totals across orders
    if (entity === 'platform' || !entity) {
      const pipeline = [];
      if (baseMatch && baseMatch.createdAt && Object.keys(baseMatch.createdAt).length > 0) {
        pipeline.push({ $match: baseMatch });
      } else {
        pipeline.push({ $match: { status: { $in: COMPLETED_STATUSES } } });
      }
      pipeline.push({ $group: { _id: fmt.groupBy, totalRevenue: { $sum: { $ifNull: ['$total', 0] } }, platformFee: { $sum: { $ifNull: ['$platformFee', 0] } }, driverRevenue: { $sum: { $ifNull: ['$driverRevenue', 0] } }, orders: { $sum: 1 } } });
      pipeline.push({ $sort: { '_id': 1 } });
      const rows = await Order.aggregate(pipeline).exec();
      return res.json({ series: rows.map(r => ({ period: r._id, totalRevenue: r.totalRevenue, platformFee: r.platformFee, driverRevenue: r.driverRevenue, orders: r.orders })) });
    }

    return res.status(400).json({ message: 'Invalid entity' });
  } catch (e) {
    console.error('analytics.getRevenueSeries error', e);
    return res.status(500).json({ message: 'Server error' });
  }
};

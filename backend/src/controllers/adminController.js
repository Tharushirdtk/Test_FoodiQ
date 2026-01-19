const User = require('../models/User');
const bcrypt = require('bcryptjs');
const Order = require('../models/Order');

// Export CSV for admin: supports exporting raw orders (per-item rows) or aggregated chart series
exports.exportOrdersCsv = async (req, res) => {
  try {
    const { vendorId, from, to, chart = 'orders', interval, range } = req.query;
    // normalize interval name
    const intervalToUse = interval || range || 'monthly';

    // If chart === 'orders' keep existing per-order-item CSV behaviour
    if (chart === 'orders') {
      const filter = {};
      if (vendorId) {
        filter.$or = [ { 'items.vendor': vendorId }, { 'vendorAddresses.vendor': vendorId }, { 'vendorAddress.vendor': vendorId } ];
      }
      if (from || to) {
        filter.createdAt = {};
        if (from) filter.createdAt.$gte = new Date(from);
        if (to) filter.createdAt.$lte = new Date(to);
      }

      const orders = await Order.find(filter).populate('user', 'email name').sort({ createdAt: -1 }).lean();

      const headers = ['orderId','createdAt','status','customerEmail','customerName','product','price','quantity','vendorId','vendorRevenue','total'];
      const rows = [headers.join(',')];
      for (const o of orders) {
        const created = new Date(o.createdAt).toISOString();
        const customerEmail = (o.user && o.user.email) ? o.user.email : '';
        const customerName = (o.user && o.user.name) ? o.user.name : '';
        for (const it of (o.items || [])) {
          const cols = [
            o._id.toString(),
            `"${created}"`,
            (o.status || ''),
            `"${customerEmail}"`,
            `"${customerName}"`,
            `"${(it.name || '').replace(/"/g,'""') }"`,
            it.price || 0,
            it.quantity || 0,
            it.vendor ? it.vendor.toString() : '',
            it.vendorRevenue || 0,
            o.total || 0,
          ];
          rows.push(cols.join(','));
        }
      }

      const csv = rows.join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="orders_export_${Date.now()}.csv"`);
      return res.send(csv);
    }

    // For aggregated charts reuse analytics aggregation logic for platform totals
    // build date format for grouping
    const dateFormatForRange = (r) => {
      switch (r) {
        case 'daily': return { format: '%Y-%m-%d', groupBy: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } } };
        case 'weekly': return { format: '%G-%V', groupBy: { $dateToString: { format: '%G-%V', date: '$createdAt' } } };
        case 'yearly': return { format: '%Y', groupBy: { $dateToString: { format: '%Y', date: '$createdAt' } } };
        case 'monthly':
        default:
          return { format: '%Y-%m', groupBy: { $dateToString: { format: '%Y-%m', date: '$createdAt' } } };
      }
    };

    const fmt = dateFormatForRange(intervalToUse);
    const COMPLETED_STATUSES = ['delivered', 'picked_up_my_order', 'completed'];
    const baseMatch = { status: { $in: COMPLETED_STATUSES } };
    if (from || to) {
      baseMatch.createdAt = {};
      if (from) {
        const fromDate = String(from).includes('T') ? new Date(from) : new Date(String(from) + 'T00:00:00.000Z');
        baseMatch.createdAt.$gte = fromDate;
      }
      if (to) {
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

    const pipeline = [];
    if (baseMatch && baseMatch.createdAt && Object.keys(baseMatch.createdAt).length > 0) {
      pipeline.push({ $match: baseMatch });
    } else {
      pipeline.push({ $match: baseMatch });
    }

    pipeline.push({ $group: { _id: fmt.groupBy, totalRevenue: { $sum: { $ifNull: ['$total', 0] } }, platformFee: { $sum: { $ifNull: ['$platformFee', 0] } }, driverRevenue: { $sum: { $ifNull: ['$driverRevenue', 0] } }, orders: { $sum: 1 } } });
    pipeline.push({ $sort: { '_id': 1 } });

    const rowsAgg = await Order.aggregate(pipeline).exec();

    // Build CSV with columns: period, value, count (count for orders)
    const headers = ['period','value','count'];
    const rows = [headers.join(',')];
    for (const r of rowsAgg) {
      let val = '';
      if (chart === 'totalRevenue') val = r.totalRevenue || 0;
      else if (chart === 'driverRevenue') val = r.driverRevenue || 0;
      else if (chart === 'platformFee') val = r.platformFee || 0;
      else if (chart === 'orders') val = r.orders || 0;
      const cols = [ `"${r._id}"`, val, r.orders || 0 ];
      rows.push(cols.join(','));
    }

    const csv = rows.join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="chart_export_${chart}_${Date.now()}.csv"`);
    return res.send(csv);
  } catch (e) {
    console.error('exportOrdersCsv error', e);
    return res.status(500).json({ message: 'Server error' });
  }
};

// List all users (with optional filters)
exports.listUsers = async (req, res) => {
  try {
    // Support single `role` or multi `roles` (comma-separated) for filtering
    const { role, roles, search, page = 1, limit = 20 } = req.query;
    // debug logging removed
    // Build composable filters using $and so role filters and search combine correctly
    const andClauses = [];

    // multi roles support — when some existing documents have no `role`, treat missing as 'customer'
    if (roles) {
      const arr = String(roles).split(',').map(r => r.trim()).filter(Boolean);
      if (arr.length > 0) {
        // If client asked for 'customer', include documents where `role` is missing
        if (arr.includes('customer')) {
          andClauses.push({ $or: [ { role: { $in: arr } }, { role: { $exists: false } } ] });
        } else {
          andClauses.push({ role: { $in: arr } });
        }
      }
    } else if (role) {
      andClauses.push({ role });
    }

    if (search) {
      andClauses.push({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ]
      });
    }

    const filter = andClauses.length > 0 ? { $and: andClauses } : {};

    // debug logging removed

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const users = await User.find(filter).skip(skip).limit(parseInt(limit)).sort({ createdAt: -1 });
    const total = await User.countDocuments(filter);

    // expose available roles for frontend filter UI
    const roleEnum = Array.isArray(User.schema.path('role')?.enumValues)
      ? User.schema.path('role').enumValues
      : ['customer', 'driver', 'support', 'admin', 'vendor'];

    res.json({ users, total, page: parseInt(page), pages: Math.ceil(total / limit), filters: { roles: roleEnum } });
  } catch (e) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Create a new user (any role)
exports.createUser = async (req, res) => {
  try {
    const { name, email, password, role, ...rest } = req.body;
    if (!name || !email || !password || !role) return res.status(400).json({ message: 'Missing required fields' });
    // Validate password strength server-side
    try {
      const { passwordSchema } = require('../utils/validators');
      const { error } = passwordSchema.validate(password);
      if (error) return res.status(400).json({ message: 'Password does not meet requirements', details: error.details.map(d => d.message) });
    } catch (e) {}
    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ message: 'Email already exists' });
    // Let the User pre-save hook hash the password once. Do NOT pre-hash here to avoid double-hashing.
    const user = await User.create({ name, email, password, role, ...rest });
    res.status(201).json({ user });
  } catch (e) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Update user info/role
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { password, ...rest } = req.body;
    // If password provided, validate and use Mongoose save() so pre-save hook hashes and schema validators run
    if (password) {
      try {
        const { passwordSchema } = require('../utils/validators');
        const { error } = passwordSchema.validate(password);
        if (error) return res.status(400).json({ message: 'Password does not meet requirements', details: error.details.map(d => d.message) });
      } catch (e) {}

      const user = await User.findById(id);
      if (!user) return res.status(404).json({ message: 'User not found' });
      user.set({ ...rest });
      user.password = password; // will be hashed by pre-save hook
      await user.save();
      return res.json({ user });
    }

    const update = { ...rest };
    const user = await User.findByIdAndUpdate(id, update, { new: true });
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user });
  } catch (e) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete user
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByIdAndDelete(id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'User deleted' });
  } catch (e) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Get single user by id
exports.getUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).lean();
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user });
  } catch (e) {
    res.status(500).json({ message: 'Server error' });
  }
};

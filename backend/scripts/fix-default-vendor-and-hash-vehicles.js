const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('../src/models/User');
const Product = require('../src/models/Product');
const Order = require('../src/models/Order');

const MONGO = process.env.MONGO_URI || process.env.DATABASE_URL || 'mongodb://localhost:27017/foodiq';

async function main() {
  await mongoose.connect(MONGO, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to MongoDB');

  // 1) Create default vendor if not exists
  // Use a valid-looking email that satisfies the User email regex (requires a TLD)
  let defaultVendor = await User.findOne({ email: 'default-vendor@default.local.com' });
  if (!defaultVendor) {
    defaultVendor = await User.create({
      name: 'Default Vendor',
      email: 'default-vendor@default.local.com',
      password: Math.random().toString(36).slice(2, 12) + 'A1!',
      role: 'vendor',
      emailVerified: true,
      phoneVerified: true,
      vendorProfile: { storeName: 'Default Vendor', storeAddress: 'Default', approved: true }
    });
    console.log('Created Default Vendor:', defaultVendor._id.toString());
  } else {
    console.log('Default Vendor exists:', defaultVendor._id.toString());
  }

  // 2) Assign products without vendor to default vendor
  // Use a direct update to avoid triggering product validation issues
  const prodFilter = { $or: [ { vendor: null }, { vendor: { $exists: false } } ] };
  const prodCount = await Product.countDocuments(prodFilter);
  console.log('Products without vendor found:', prodCount);
  if (prodCount > 0) {
    await Product.updateMany(prodFilter, { $set: { vendor: defaultVendor._id } }).exec();
    console.log('Assigned default vendor to products (db update)');
  }

  // 3) Fix orders: set item.vendor and vendorAddress vendor if missing
  const orders = await Order.find({ $or: [ { 'items.vendor': { $in: [null, undefined] } }, { vendorAddress: { $exists: true, $ne: null, $not: { $elemMatch: { vendor: { $exists: true } } } } } ] });
  console.log('Orders possibly missing vendor info (scanning all orders might be slow)');

  const allOrders = await Order.find({});
  let fixedOrders = 0;
  for (const o of allOrders) {
    let changed = false;
    if (Array.isArray(o.items)) {
      for (const it of o.items) {
        if (!it.vendor) { it.vendor = defaultVendor._id; changed = true; }
      }
    }
    if (o.vendorAddress && !o.vendorAddress.vendor) { o.vendorAddress.vendor = defaultVendor._id; changed = true; }
    if (Array.isArray(o.vendorAddresses)) {
      for (const va of o.vendorAddresses) {
        if (va && !va.vendor) { va.vendor = defaultVendor._id; changed = true; }
      }
    }
    if (changed) { await o.save({ validateBeforeSave: false }); fixedOrders++; }
  }
  console.log('Fixed orders count:', fixedOrders);

  // 4) Hash existing driver vehicle numbers if not hashed (bcrypt hash starts with $2)
  const drivers = await User.find({ role: 'driver', 'driverProfile.vehicleNumber': { $exists: true, $ne: null } });
  console.log('Drivers with vehicleNumber found:', drivers.length);
  let hashedCount = 0;
  for (const d of drivers) {
    const vn = d.driverProfile.vehicleNumber;
    if (vn && typeof vn === 'string' && !vn.startsWith('$2')) {
      const salt = await bcrypt.genSalt(10);
      d.driverProfile.vehicleNumber = await bcrypt.hash(String(vn), salt);
      await d.save();
      hashedCount++;
    }
  }
  console.log('Hashed vehicle numbers for drivers:', hashedCount);

  console.log('Migration complete');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });

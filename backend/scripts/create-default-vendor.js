#!/usr/bin/env node
/**
 * Create a Default Vendor user and backfill missing vendor references.
 * Usage: node create-default-vendor.js --dry
 *        node create-default-vendor.js --apply
 */
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Product = require('../src/models/Product');
const Order = require('../src/models/Order');
require('dotenv').config({ path: __dirname + '/../.env' });

async function run() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  console.log('Connecting to MongoDB...', process.env.MONGO_URI);
  await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected');

  const defaultEmail = 'default-vendor@yourapp.local';
  let vendor = await User.findOne({ email: defaultEmail });
  if (vendor) {
    console.log('Default vendor already exists:', vendor._id.toString());
  } else {
    console.log('Default vendor does not exist yet.');
  }

  if (!vendor && apply) {
    vendor = await User.create({
      name: 'Default Vendor',
      email: defaultEmail,
      password: Math.random().toString(36).slice(2, 12) + 'A1!',
      role: 'vendor',
      vendorProfile: { storeName: 'Default Vendor', storeAddress: 'Default address', approved: false },
      emailVerified: false,
      phoneVerified: false,
    });
    console.log('Created Default Vendor:', vendor._id.toString());
  }

  if (!vendor) {
    console.log('Dry run: would create default vendor with email', defaultEmail);
  }

  // Backfill Products without vendor
  const productsNoVendor = await Product.find({ $or: [ { vendor: null }, { vendor: { $exists: false } } ] });
  console.log('Products without vendor found:', productsNoVendor.length);
  if (productsNoVendor.length > 0) {
    if (apply) {
      const vId = vendor._id;
      const res = await Product.updateMany({ $or: [ { vendor: null }, { vendor: { $exists: false } } ] }, { $set: { vendor: vId } });
      console.log('Updated products count:', res.nModified || res.modifiedCount || res.n || 0);
    } else {
      console.log('Dry run: would set vendor to default vendor for these products');
    }
  }

  // Backfill order items vendor field where missing
  const cursor = Order.find().cursor();
  let total = 0, toUpdate = 0;
  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    total++;
    let changed = false;
    const items = doc.items || [];
    for (let i = 0; i < items.length; i++) {
      if (!items[i].vendor) {
        items[i].vendor = vendor ? vendor._id : null;
        changed = true;
      }
    }
    if (changed) {
      toUpdate++;
      if (apply) {
        await Order.findByIdAndUpdate(doc._id, { $set: { items } }).exec();
      }
    }
  }
  console.log('Scanned orders:', total, 'Orders needing update:', toUpdate, 'apply=', apply);

  await mongoose.disconnect();
  console.log('Done');
}

run().catch(err => { console.error(err); process.exit(1); });

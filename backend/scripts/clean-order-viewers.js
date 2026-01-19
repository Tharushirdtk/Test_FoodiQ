/**
 * Clean order viewers by removing user IDs that no longer exist in the `users` collection.
 * - Logs how many orders were scanned, how many viewer entries removed.
 * - Safe to run repeatedly.
 *
 * Run from repo root:
 *   node backend/scripts/clean-order-viewers.js
 *
 * WARNING: This modifies orders documents. Backup DB before running in production.
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const Order = require('../src/models/Order');
const User = require('../src/models/User');

async function run() {
  const mongo = process.env.MONGO_URI || 'mongodb://localhost:27017/restaurant';
  await mongoose.connect(mongo, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to DB', mongo);

  try {
    const cursor = Order.find({ viewers: { $exists: true, $ne: [] } }).cursor();
    let scanned = 0;
    let changed = 0;

    for (let order = await cursor.next(); order != null; order = await cursor.next()) {
      scanned++;
      const original = Array.isArray(order.viewers) ? order.viewers.map(v => String(v)) : [];
      if (original.length === 0) continue;

      const keep = [];
      for (const vid of original) {
        try {
          // Check if user exists
          const exists = await User.exists({ _id: mongoose.Types.ObjectId(vid) });
          if (exists) keep.push(mongoose.Types.ObjectId(vid));
        } catch (e) {
          // If vid is not a valid ObjectId, ignore it
        }
      }

      // Remove duplicates while preserving order
      const uniq = [...new Set(keep.map(v => String(v)))].map(s => mongoose.Types.ObjectId(s));

      const removedCount = original.length - uniq.length;
      if (removedCount > 0) {
        await Order.updateOne({ _id: order._id }, { $set: { viewers: uniq } });
        changed++;
        console.log(`Order ${order._id.toString()}: removed ${removedCount} stale viewer(s)`);
      }
    }

    console.log(`Scanned ${scanned} orders, cleaned ${changed} orders with stale viewers.`);
  } catch (e) {
    console.error('Failed to clean viewers', e);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected');
  }
}

run().catch(err => { console.error(err); process.exit(1); });

/**
 * Simple script to set all existing orders to status 'ready' for pickup.
 * Run from the repo root: `node backend/scripts/set-orders-ready.js`
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const Order = require('../src/models/Order');

async function run() {
  const mongo = process.env.MONGO_URI || 'mongodb://localhost:27017/restaurant';
  await mongoose.connect(mongo, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to DB', mongo);

  try {
    const res = await Order.updateMany({}, { $set: { status: 'ready_for_pickup' } });
    console.log('Updated orders:', res.nModified || res.modifiedCount || res.n || res.count || res);
  } catch (e) {
    console.error('Failed to update orders', e);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected');
  }
}

run().catch(err => { console.error(err); process.exit(1); });

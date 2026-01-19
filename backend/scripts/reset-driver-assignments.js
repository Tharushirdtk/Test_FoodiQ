/**
 * Reset driver assignment state in the database.
 * - Clears `assignedOrders` on all Driver docs
 * - Unsets `currentAssignedOrder` on all Driver docs
 * - Removes `driver`, `assignedAt`, and `assignedBy` from Orders that reference a driver
 *
 * Run from repo root:
 *   node backend/scripts/reset-driver-assignments.js
 *
 * WARNING: This is destructive. BACKUP your DB before running in production.
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const Driver = require('../src/models/Driver');
const Order = require('../src/models/Order');
const User = require('../src/models/User');

async function run() {
  const mongo = process.env.MONGO_URI || 'mongodb://localhost:27017/restaurant';
  await mongoose.connect(mongo, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to DB', mongo);

  try {
    const drvRes = await Driver.updateMany({}, { $set: { assignedOrders: [] }, $unset: { currentAssignedOrder: '' } });
    console.log('Drivers updated:', drvRes && (drvRes.nModified || drvRes.modifiedCount || drvRes.n) || drvRes);

    // Remove driver references from orders that currently reference a driver
    const orderRes = await Order.updateMany({ driver: { $exists: true, $ne: null } }, { $unset: { driver: '', assignedAt: '', assignedBy: '' } });
    console.log('Orders cleared driver ref:', orderRes && (orderRes.nModified || orderRes.modifiedCount || orderRes.n) || orderRes);

    // Clear assignedOrders in user.driverProfile so driver-linked user profiles don't trigger redirects
    try {
      const userRes = await User.updateMany({ 'driverProfile.assignedOrders.0': { $exists: true } }, { $set: { 'driverProfile.assignedOrders': [] } });
      console.log('Users cleared driverProfile.assignedOrders:', userRes && (userRes.nModified || userRes.modifiedCount || userRes.n) || userRes);
    } catch (e) {
      console.warn('Failed to clear user.driverProfile.assignedOrders', e && e.message);
    }

    console.log('Reset complete. Consider running set-orders-ready.js separately if you want to mark orders ready.');
  } catch (e) {
    console.error('Failed to reset assignments', e);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected');
  }
}

run().catch(err => { console.error(err); process.exit(1); });

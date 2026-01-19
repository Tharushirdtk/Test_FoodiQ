require('dotenv').config();
const connectDB = require('../src/config/database');
const mongoose = require('mongoose');

const run = async () => {
  await connectDB();
  const Order = require('../src/models/Order');

  const mapping = {
    pending: 'order_placed',
    confirmed: 'order_confirmed',
    preparing: 'preparing_your_meal',
    ready: 'ready_for_pickup',
    assigned: 'driver_assigned',
    delivering: 'out_for_delivery',
    'out_for_delivery': 'out_for_delivery',
    picked_up: 'order_picked_up',
    delivered: 'delivered',
    cancelled: 'cancelled'
  };

  console.log('Starting order status migration...');

  for (const [oldStatus, newStatus] of Object.entries(mapping)) {
    try {
      const filter = { status: oldStatus };
      const res = await Order.updateMany(filter, { $set: { status: newStatus } });
      console.log(`Mapped '${oldStatus}' -> '${newStatus}': matched=${res.matchedCount || res.n || 0}, modified=${res.modifiedCount || res.nModified || 0}`);
    } catch (e) {
      console.error(`Failed to migrate '${oldStatus}' -> '${newStatus}':`, e && e.message ? e.message : e);
    }
  }

  console.log('Migration complete. Disconnecting...');
  try { await mongoose.disconnect(); } catch (e) {}
  process.exit(0);
};

run().catch(err => {
  console.error('Migration script failed:', err && err.message ? err.message : err);
  process.exit(1);
});

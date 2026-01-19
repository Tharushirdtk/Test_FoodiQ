require('dotenv').config();
const connectDB = require('../src/config/database');
const mongoose = require('mongoose');

const run = async () => {
  await connectDB();
  const Order = require('../src/models/Order');

  const dry = process.argv.includes('--dry');

  console.log('Reconciling order statuses' + (dry ? ' (dry run)' : ''));

  // Set orders that have an assigned driver (driver field exists and is not null) to 'driver_assigned',
  // unless they are already delivered or cancelled.
  const driverFilter = { driver: { $exists: true, $ne: null }, status: { $nin: ['delivered', 'cancelled'] } };
  const readyFilter = { $or: [ { driver: { $exists: false } }, { driver: null } ], status: { $nin: ['delivered', 'cancelled'] } };

  if (dry) {
    const withDriver = await Order.countDocuments(driverFilter);
    const withoutDriver = await Order.countDocuments(readyFilter);
    console.log(`Would mark ${withDriver} orders as 'driver_assigned' and ${withoutDriver} orders as 'ready_for_pickup'.`);
  } else {
    const res1 = await Order.updateMany(driverFilter, { $set: { status: 'driver_assigned' } });
    const res2 = await Order.updateMany(readyFilter, { $set: { status: 'ready_for_pickup' } });
    console.log(`Marked ${res1.modifiedCount || res1.nModified || res1.modified || 0} orders as 'driver_assigned'.`);
    console.log(`Marked ${res2.modifiedCount || res2.nModified || res2.modified || 0} orders as 'ready_for_pickup'.`);

    // Print examples
    const exampleAssigned = await Order.findOne(driverFilter).lean().limit(1);
    const exampleReady = await Order.findOne(readyFilter).lean().limit(1);
    console.log('Example assigned order:', exampleAssigned ? { _id: exampleAssigned._id, status: exampleAssigned.status, driver: exampleAssigned.driver } : 'none');
    console.log('Example ready order:', exampleReady ? { _id: exampleReady._id, status: exampleReady.status } : 'none');
  }

  // Close DB connection
  try {
    await mongoose.disconnect();
  } catch (e) {}
};

run().catch(err => {
  console.error('Script failed:', err && err.message ? err.message : err);
  process.exit(1);
});

// Usage:
// node backend/scripts/update-order-statuses.js       # perform changes
// node backend/scripts/update-order-statuses.js --dry # dry run

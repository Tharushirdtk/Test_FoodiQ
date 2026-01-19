const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    // Create partial unique indexes to enforce driver/order invariants (defense-in-depth)
    try {
      // require models so collections are registered
      const Order = require('../models/Order');
      const Driver = require('../models/Driver');

      // Ensure a driver cannot be assigned more than one active order (assigned/delivering)
      await Order.collection.createIndex(
        { driver: 1 },
        {
          unique: true,
          partialFilterExpression: { driver: { $exists: true }, status: { $in: ['driver_assigned', 'out_for_delivery'] } },
        }
      );
      // Ensure a driver's currentAssignedOrder is unique across drivers
      await Driver.collection.createIndex(
        { currentAssignedOrder: 1 },
        {
          unique: true,
          partialFilterExpression: { currentAssignedOrder: { $exists: true } },
        }
      );
      // Ensure one canonical pairwise conversation per order by participantsKey (non-support only)
      try {
        const Conversation = require('../models/Conversation');
        await Conversation.collection.createIndex(
          { order: 1, participantsKey: 1 },
          { unique: true, partialFilterExpression: { isSupportConversation: false, participantsKey: { $exists: true } }, name: 'order_participantsKey_unique' }
        );
        console.log('Created index: order+participantsKey unique for non-support conversations');
      } catch (e) {
        console.warn('Failed to create participantsKey unique index (may already exist):', e && e.message);
      }
      console.log('Database indexes for driver/order invariants ensured');
    } catch (indexErr) {
      console.warn('Failed to create driver/order invariant indexes (they may already exist or the DB has conflicts):', indexErr && indexErr.message ? indexErr.message : indexErr);
    }
  } catch (error) {
    console.error('MongoDB connection error:', error && error.message ? error.message : error);
    console.error('Please check your MONGO_URI in .env and your network/DNS settings.');
    // In development allow the process to continue so the developer can fix configuration without nodemon exiting.
    // Nodemon will still show the error; set NODE_ENV=test to avoid exiting in automated tests.
  }
};

module.exports = connectDB;
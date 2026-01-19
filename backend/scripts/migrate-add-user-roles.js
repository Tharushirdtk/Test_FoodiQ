// scripts/migrate-add-user-roles.js
// Usage: node scripts/migrate-add-user-roles.js
const mongoose = require('mongoose');
const User = require('../src/models/User');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/restaurant';

(async () => {
  await mongoose.connect(MONGO_URI);
  const users = await User.find({ role: { $exists: false } });
  for (const user of users) {
    user.role = 'customer';
    await user.save();
    console.log(`Updated user ${user.email} with role 'customer'`);
  }
  console.log('Migration complete.');
  process.exit(0);
})();

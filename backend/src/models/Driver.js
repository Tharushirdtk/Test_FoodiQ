const mongoose = require('mongoose');

const driverSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name: { type: String, required: true },
  phone: { type: String },
  vehicle: { type: String },
  avatar: { type: String },
  rating: { type: Number, default: 5 },
  active: { type: Boolean, default: true },
  location: {
    lat: Number,
    lng: Number,
    updatedAt: Date
  },
  assignedOrders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order' }],
  currentAssignedOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null }
}, { timestamps: true });

module.exports = mongoose.model('Driver', driverSchema);

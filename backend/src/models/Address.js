const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  label: { type: String, default: 'Home' },
  type: String, // legacy field
  street: String,
  city: String,
  state: String,
  postalCode: String,
  zip: String, // legacy field
  country: { type: String, default: 'Sri Lanka' },
  isDefault: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Address', addressSchema);

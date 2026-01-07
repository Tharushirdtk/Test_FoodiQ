const mongoose = require('mongoose');

const voucherSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  discountType: { type: String, enum: ['amount','percent'], default: 'amount' },
  amount: Number,
  expiresAt: Date,
  usageLimit: Number,
}, { timestamps: true });

module.exports = mongoose.model('Voucher', voucherSchema);

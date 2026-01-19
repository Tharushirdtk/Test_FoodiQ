const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, default: 1 },
  options: Object,
  // Snapshot of selected attributes for this cart item
  selectedAttributes: [{
    id: { type: mongoose.Schema.Types.ObjectId },
    name: String,
    // support negative modifiers as well as flat/percent
    priceType: { type: String, enum: ['flat', 'percent', 'minus-flat', 'minus-percent'], default: 'flat' },
    amount: { type: Number, default: 0 },
    quantity: { type: Number, default: 1 },
    computedAmount: { type: Number, default: 0 }
  }],
  attributesTotal: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('CartItem', cartItemSchema);

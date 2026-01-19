const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  // Generic entity review: entityType (product|vendor|driver), entityId references the target
  entityType: { type: String, enum: ['product','vendor','driver'], required: true },
  entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
  // Backwards-compatible product field
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  rating: { type: Number, min: 1, max: 5 },
  text: String,
}, { timestamps: true });

module.exports = mongoose.model('Review', reviewSchema);

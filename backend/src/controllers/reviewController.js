const mongoose = require('mongoose');
const Review = require('../models/Review');
const Product = require('../models/Product');
const socketUtil = require('../utils/socket');

// Helper to recalculate and persist product aggregates
async function recalcProductStats(productId) {
  // Recalculate aggregates and update product document without triggering schema validators
  const matchId = (productId && productId._bsontype === 'ObjectID') ? productId : new mongoose.Types.ObjectId(productId);
    const stats = await Review.aggregate([
      { $match: { entityType: 'product', entityId: matchId } },
    { $group: {
        _id: '$product',
        avgRating: { $avg: '$rating' },
        count: { $sum: 1 },
        latestReviewAt: { $max: '$updatedAt' }
    } }
  ]);
  let newRating = 0;
  let newCount = 0;
  let latestReviewAt = null;
  if (stats && stats.length > 0) {
    newRating = Number((stats[0].avgRating || 0).toFixed(2));
    newCount = stats[0].count;
    latestReviewAt = stats[0].latestReviewAt || null;
  }
  // Use updateOne to avoid running model validators (category enum issues can block save())
  await Product.updateOne(
    { _id: productId },
    { $set: { rating: newRating, reviewCount: newCount, latestReviewAt: latestReviewAt, updatedAt: new Date() } }
  );
  // Emit product-level update to products room
  try {
    const io = socketUtil.getIo();
    if (io) {
      io.to('products').emit('productReviewsUpdated', { productId: String(productId), rating: newRating, reviewCount: newCount, latestReviewAt });
    }
  } catch (e) { console.warn('Failed to emit productReviewsUpdated', e && e.message); }
}

// GET /api/products/:id/reviews
exports.getReviews = async (req, res) => {
  try {
    const productId = req.params.id;
      const reviews = await Review.find({ entityType: 'product', entityId: productId }).populate('user', 'name').sort({ createdAt: -1 });
    return res.status(200).json({ reviews });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/products/:id/reviews { rating, text }
// If the user has already reviewed the product, update that review instead of creating a duplicate.
exports.addReview = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });

    const productId = req.params.id;
    const { rating, text } = req.body;
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ message: 'rating must be between 1 and 5' });

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    // Check for existing review by this user
      let review = await Review.findOne({ entityType: 'product', entityId: productId, user: userId });
    if (review) {
      review.rating = Number(rating);
      review.text = text;
      await review.save();
      // Recalculate stats
      try { await recalcProductStats(productId); } catch (e) { console.error(e); }
      try { const io = socketUtil.getIo(); if (io) io.to('products').emit('productReviewSaved', { action: 'updated', productId, review: review.toObject() }); } catch (e) {}
      return res.status(200).json(review);
    }

      review = await Review.create({ entityType: 'product', entityId: productId, product: productId, user: userId, rating: Number(rating), text });
    // Recalculate product rating and reviewCount
    try { await recalcProductStats(productId); } catch (err) { console.error('Failed to update product stats after review:', err); }
      try { const io = socketUtil.getIo(); if (io) io.to('products').emit('productReviewSaved', { action: 'created', productId, review: review.toObject() }); } catch (e) {}

    return res.status(201).json(review);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// PATCH /api/products/:id/reviews/:reviewId
exports.updateReview = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });

    const { id: productId, reviewId } = req.params;
    const { rating, text } = req.body;

    const review = await Review.findById(reviewId);
    if (!review) return res.status(404).json({ message: 'Review not found' });
    if (String(review.user) !== String(userId) && !(req.user && req.user.role === 'admin')) return res.status(403).json({ message: 'Forbidden' });

    if (rating) {
      if (rating < 1 || rating > 5) return res.status(400).json({ message: 'rating must be between 1 and 5' });
      review.rating = Number(rating);
    }
    if (typeof text !== 'undefined') review.text = text;
    await review.save();
    try { await recalcProductStats(productId); } catch (e) { console.error(e); }
    try { const io = socketUtil.getIo(); if (io) io.to('products').emit('productReviewSaved', { action: 'updated', productId, review: review.toObject() }); } catch (e) {}
    return res.status(200).json(review);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// DELETE /api/products/:id/reviews/:reviewId
exports.deleteReview = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });

    const { id: productId, reviewId } = req.params;
    const review = await Review.findById(reviewId);
    if (!review) return res.status(404).json({ message: 'Review not found' });
    if (String(review.user) !== String(userId) && !(req.user && req.user.role === 'admin')) return res.status(403).json({ message: 'Forbidden' });

    // use deleteOne() for mongoose v6+ compatibility
    await review.deleteOne();
    try { await recalcProductStats(productId); } catch (e) { console.error(e); }
    try { const io = socketUtil.getIo(); if (io) io.to('products').emit('productReviewSaved', { action: 'deleted', productId, reviewId }); } catch (e) {}
    return res.status(200).json({ message: 'Review deleted' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

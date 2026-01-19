const express = require('express');
const router = express.Router();
const { getRatings, addRating, deleteRating } = require('../controllers/ratingsController');
const { protect, optionalAuth } = require('../middleware/auth');

// Allow public access to read ratings but accept an auth token to compute `canRate`.
// Only posting requires authentication.
router.get('/', optionalAuth, getRatings);
router.post('/', protect, addRating);
router.delete('/:id', protect, deleteRating);

module.exports = router;

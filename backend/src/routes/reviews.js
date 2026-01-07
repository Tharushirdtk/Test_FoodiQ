const express = require('express');
const router = express.Router({ mergeParams: true });
const { getReviews, addReview } = require('../controllers/reviewController');
const { protect } = require('../middleware/auth');

router.get('/', getReviews);
router.post('/', protect, addReview);

module.exports = router;

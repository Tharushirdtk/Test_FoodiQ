const express = require('express');
const router = express.Router();
const { getFavorites, addFavorite, removeFavorite } = require('../controllers/favoritesController');
const { protect } = require('../middleware/auth');

router.get('/', protect, getFavorites);
router.post('/', protect, addFavorite);
router.delete('/:productId', protect, removeFavorite);

module.exports = router;

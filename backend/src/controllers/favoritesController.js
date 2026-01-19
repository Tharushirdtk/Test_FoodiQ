const Favorite = require('../models/Favorite');
const Product = require('../models/Product');

// GET /api/users/favorites
exports.getFavorites = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });

    console.log('[favoritesController] GET favorites for user:', userId);

    const favs = await Favorite.find({ user: userId }).populate('product').sort({ createdAt: -1 });
    console.log('[favoritesController] GET favorites result count:', favs.length);
    return res.status(200).json({ favorites: favs });
  } catch (error) {
    console.error('[favoritesController] GET favorites error', error && error.message);
    return res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/users/favorites { productId }
exports.addFavorite = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });

    const { productId } = req.body;
    console.log('[favoritesController] POST addFavorite', { userId, productId });
    if (!productId) return res.status(400).json({ message: 'productId is required' });

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    // create or return existing favorite
    await Favorite.findOneAndUpdate(
      { user: userId, product: productId },
      { user: userId, product: productId },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const doc = await Favorite.findOne({ user: userId, product: productId }).populate('product');
    console.log('[favoritesController] POST addFavorite created', doc && doc._id);
    return res.status(201).json(doc);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(200).json({ message: 'Already in favorites' });
    }
    console.error('[favoritesController] POST addFavorite error', error && error.message);
    return res.status(500).json({ message: 'Server error' });
  }
};

// DELETE /api/users/favorites/:productId
exports.removeFavorite = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });

    const productId = req.params.productId;
    console.log('[favoritesController] DELETE removeFavorite', { userId, productId });
    if (!productId) return res.status(400).json({ message: 'productId is required' });

    const removed = await Favorite.findOneAndDelete({ user: userId, product: productId });
    if (!removed) {
      console.log('[favoritesController] DELETE removeFavorite - not found');
      return res.status(404).json({ message: 'Favorite not found' });
    }
    console.log('[favoritesController] DELETE removeFavorite - removed id:', removed._id);
    return res.status(200).json({ message: 'Removed from favorites' });
  } catch (error) {
    console.error('[favoritesController] DELETE removeFavorite error', error && error.message);
    return res.status(500).json({ message: 'Server error' });
  }
};

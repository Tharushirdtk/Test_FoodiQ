const CartItem = require('../models/CartItem');
const Product = require('../models/Product');

// POST /api/cart - add item to user's cart
exports.addToCart = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });

    const { productId, quantity = 1, options } = req.body;
    if (!productId) return res.status(400).json({ message: 'productId is required' });

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    // Try to find an existing cart item with same product and options
    const existing = await CartItem.findOne({ user: userId, product: productId, options: options || {} });
    if (existing) {
      existing.quantity = (existing.quantity || 0) + Number(quantity);
      await existing.save();
      const populated = await existing.populate('product');
      return res.status(200).json(populated);
    }

    const item = await CartItem.create({ user: userId, product: productId, quantity, options });
    const populated = await item.populate('product');
    return res.status(201).json(populated);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/cart - get current user's cart
exports.getCart = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });

    const items = await CartItem.find({ user: userId }).populate('product').sort({ createdAt: -1 });
    return res.status(200).json(items);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// PUT /api/cart/:itemId - update item quantity/options
exports.updateCartItem = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });

    const item = await CartItem.findById(req.params.itemId);
    if (!item) return res.status(404).json({ message: 'Cart item not found' });
    if (item.user.toString() !== userId.toString()) return res.status(403).json({ message: 'Forbidden' });

    const { quantity, options } = req.body;
    if (quantity !== undefined) item.quantity = Number(quantity);
    if (options !== undefined) item.options = options;

    if (item.quantity <= 0) {
      // use deleteOne for compatibility with Mongoose v7+ (document.remove may be absent)
      await item.deleteOne();
      return res.status(200).json({ message: 'Item removed' });
    }

    await item.save();
    const populated = await item.populate('product');
    return res.status(200).json(populated);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// DELETE /api/cart/:itemId - remove item from cart
exports.removeCartItem = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });

    const item = await CartItem.findById(req.params.itemId);
    if (!item) return res.status(404).json({ message: 'Cart item not found' });
    if (item.user.toString() !== userId.toString()) return res.status(403).json({ message: 'Forbidden' });

    // use deleteOne to remove the document
    await item.deleteOne();
    return res.status(200).json({ message: 'Item removed' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// DELETE /api/cart - clear entire cart for current user
exports.clearCart = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });

    await CartItem.deleteMany({ user: userId });
    return res.status(200).json({ message: 'Cart cleared' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

const CartItem = require('../models/CartItem');
const Product = require('../models/Product');

// Keep options compact: only allow `selectedAttributes` to be persisted from options.
const sanitizeOptions = (opts) => {
  const o = Object.assign({}, opts || {});
  const sa = Array.isArray(o.selectedAttributes) ? o.selectedAttributes : undefined;
  const clean = {};
  if (sa) clean.selectedAttributes = sa;
  return clean;
};

// POST /api/cart - add item to user's cart
exports.addToCart = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ message: 'Not authorized' });
    const { productId, quantity = 1, options = {}, selectedAttributes = [] } = req.body;
    if (!productId) return res.status(400).json({ message: 'productId is required' });

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    // Normalize selectedAttributes into options so existing-match works if client sent attributes inside options
    const normalizedSelected = Array.isArray(selectedAttributes) ? selectedAttributes : (options.selectedAttributes || []);
    // attach into options for matching but sanitize to remove legacy fields
    const sanitizedOptions = sanitizeOptions(Object.assign({}, options, { selectedAttributes: normalizedSelected }));
    console.log('[cartController.addToCart] payload:', { productId, quantity, options, selectedAttributes: normalizedSelected });

    // Compute attribute snapshots and attributesTotal
    const computeAttributeSnapshots = (productDoc, selectedArr) => {
      const prod = productDoc || {};
      const groups = prod.attributeGroups || [];
      // build map of attribute id -> { groupKey, def }
      const attrMap = new Map();
      for (const g of groups) {
        const key = g.key || '';
        for (const a of (g.attributes || [])) {
          if (a && a._id) attrMap.set(String(a._id), { groupKey: key, def: a });
        }
      }

      // determine base price adjustments from selected size attributes (support minus-flat and minus-percent)
      let sizeFlatSum = 0;
      let sizePercentDelta = 0;
      for (const s of selectedArr) {
        const sid = String(s.id || s._id || s.id);
        const entry = attrMap.get(sid);
        if (!entry || entry.groupKey !== 'size' || !entry.def) continue;
        const def = entry.def;
        const qty = Number(s.quantity || 1) || 1;
        const dpt = String(def.priceType || 'flat').toLowerCase();
        if (dpt === 'flat') {
          sizeFlatSum += (Number(def.amount || 0) * qty);
        } else if (dpt === 'minus-flat') {
          sizeFlatSum -= (Number(def.amount || 0) * qty);
        } else if (dpt === 'percent') {
          sizePercentDelta += (Number(def.amount || 0) / 100) * (Number(prod.price || 0));
        } else if (dpt === 'minus-percent') {
          sizePercentDelta -= (Number(def.amount || 0) / 100) * (Number(prod.price || 0));
        }
      }
      const productBasePrice = Number(prod.price || 0) + sizeFlatSum + sizePercentDelta;

      const snapshots = [];
      let attributesTotal = 0;
      for (const s of selectedArr) {
        const sid = String(s.id || s._id || s.id);
        const entry = attrMap.get(sid);
        let name = s.name || '';
        let priceType = s.priceType || 'flat';
        let amount = Number(s.amount || 0);
        const qty = Number(s.quantity || 1) || 1;
        if (entry && entry.def) {
          name = name || entry.def.name || name;
          priceType = entry.def.priceType || priceType;
          amount = (typeof entry.def.amount !== 'undefined') ? Number(entry.def.amount) : amount;
        }
        // Size attributes are represented by adjusting base price (already accounted for); do not double-count them in attributesTotal
        let computed = 0;
        const isSize = entry && entry.groupKey === 'size';
        if (isSize) {
          computed = 0;
        } else if (priceType === 'percent') {
          computed = Math.round((productBasePrice * (amount / 100)) * 100) / 100;
          computed = computed * qty;
        } else if (priceType === 'minus-percent') {
          computed = Math.round((productBasePrice * (amount / 100)) * 100) / 100;
          computed = -computed * qty;
        } else if (priceType === 'minus-flat') {
          computed = - (Math.round((amount) * 100) / 100) * qty;
        } else {
          computed = Math.round((amount) * 100) / 100;
          computed = computed * qty;
        }
        computed = Math.round(computed * 100) / 100;
        snapshots.push({ id: sid, name, priceType, amount, quantity: qty, computedAmount: computed });
        attributesTotal += computed;
      }
      attributesTotal = Math.round(attributesTotal * 100) / 100;
      return { snapshots, attributesTotal };
    };

    const { snapshots, attributesTotal } = computeAttributeSnapshots(product, normalizedSelected || []);
    console.log('[cartController.addToCart] computed snapshots:', snapshots);
    console.log('[cartController.addToCart] attributesTotal:', attributesTotal);

    // Try to find an existing cart item with same product and options
    const existing = await CartItem.findOne({ user: userId, product: productId, options: sanitizedOptions || {} });
    if (existing) {
      // If existing item found, increment quantity and update attributes snapshot (overwrite)
      existing.quantity = (existing.quantity || 0) + Number(quantity);
      existing.selectedAttributes = snapshots;
      existing.attributesTotal = attributesTotal;
      // ensure options remains sanitized
      existing.options = sanitizedOptions;
      await existing.save();
      const populated = await existing.populate('product');
      console.log('[cartController.addToCart] updated existing item:', populated);
      return res.status(200).json(populated);
    }

    const item = await CartItem.create({ user: userId, product: productId, quantity, options: sanitizedOptions, selectedAttributes: snapshots, attributesTotal });
    const populated = await item.populate('product');
    console.log('[cartController.addToCart] created new item:', populated);
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

    const { quantity, options, selectedAttributes = null } = req.body;
    if (quantity !== undefined) item.quantity = Number(quantity);
    if (options !== undefined) item.options = sanitizeOptions(options);

    // If selectedAttributes provided, recompute snapshots
    if (selectedAttributes !== null) {
      const product = await Product.findById(item.product);
      const normalized = Array.isArray(selectedAttributes) ? selectedAttributes : (options && options.selectedAttributes) || [];
      console.log('[cartController.updateCartItem] incoming selectedAttributes/options:', { normalized, options });
      const computeAttributeSnapshots = (productDoc, selectedArr) => {
        const prod = productDoc || {};
        const groups = prod.attributeGroups || [];
        const attrMap = new Map();
        for (const g of groups) {
          const key = g.key || '';
          for (const a of (g.attributes || [])) {
            if (a && a._id) attrMap.set(String(a._id), { groupKey: key, def: a });
          }
        }
        let sizeFlatSum = 0;
        let sizePercentDelta = 0;
        for (const s of selectedArr) {
          const sid = String(s.id || s._id || s.id);
          const entry = attrMap.get(sid);
          if (!entry || entry.groupKey !== 'size' || !entry.def) continue;
          const def = entry.def;
          const qty = Number(s.quantity || 1) || 1;
          const dpt = String(def.priceType || 'flat').toLowerCase();
          if (dpt === 'flat') {
            sizeFlatSum += (Number(def.amount || 0) * qty);
          } else if (dpt === 'minus-flat') {
            sizeFlatSum -= (Number(def.amount || 0) * qty);
          } else if (dpt === 'percent') {
            sizePercentDelta += (Number(def.amount || 0) / 100) * (Number(prod.price || 0));
          } else if (dpt === 'minus-percent') {
            sizePercentDelta -= (Number(def.amount || 0) / 100) * (Number(prod.price || 0));
          }
        }
        const productBasePrice = Number(prod.price || 0) + sizeFlatSum + sizePercentDelta;

        const snapshots = [];
        let attributesTotal = 0;
        for (const s of selectedArr) {
          const sid = String(s.id || s._id || s.id);
          const entry = attrMap.get(sid);
          let name = s.name || '';
          let priceType = s.priceType || 'flat';
          let amount = Number(s.amount || 0);
          const qty = Number(s.quantity || 1) || 1;
          if (entry && entry.def) {
            name = name || entry.def.name || name;
            priceType = entry.def.priceType || priceType;
            amount = (typeof entry.def.amount !== 'undefined') ? Number(entry.def.amount) : amount;
          }

          let computed = 0;
          if (priceType === 'percent') {
            computed = Math.round((productBasePrice * (amount / 100)) * 100) / 100;
            computed = computed * qty;
          } else if (priceType === 'minus-percent') {
            computed = Math.round((productBasePrice * (amount / 100)) * 100) / 100;
            computed = -computed * qty;
          } else if (priceType === 'minus-flat') {
            computed = - (Math.round((amount) * 100) / 100) * qty;
          } else {
            computed = Math.round((amount) * 100) / 100;
            computed = computed * qty;
          }
          computed = Math.round(computed * 100) / 100;
          snapshots.push({ id: sid, name, priceType, amount, quantity: qty, computedAmount: computed });
          attributesTotal += computed;
        }
        attributesTotal = Math.round(attributesTotal * 100) / 100;
        return { snapshots, attributesTotal };
      };

      const { snapshots, attributesTotal } = computeAttributeSnapshots(product, normalized || []);
      console.log('[cartController.updateCartItem] computed snapshots:', snapshots);
      console.log('[cartController.updateCartItem] attributesTotal:', attributesTotal);
      item.selectedAttributes = snapshots;
      item.attributesTotal = attributesTotal;
      // ensure options reflects selection for matching logic
      if (options !== undefined) item.options = sanitizeOptions(options);
    }

    if (item.quantity <= 0) {
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

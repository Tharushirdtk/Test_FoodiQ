const Product = require('../models/Product');
const User = require('../models/User');
const mongoose = require('mongoose');
const cloudinary = require('../utils/cloudinary');
const { validateProduct } = require('../utils/validation');

// @desc    Get all products with pagination, search, filtering, sorting
// @route   GET /api/products
// @access  Public
const getProducts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 12,
      search = '',
      category = '',
      minPrice,
      maxPrice,
      minRating,
      vendor,
      updatedSince,
      sort = '', // 'price_asc', 'price_desc', 'rating', 'newest'
    } = req.query;


    // Build filter query
    const filter = {};

    // Search by name or description
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    // Filter by category (supports multiple categories comma-separated)
    if (category && category !== 'All') {
      if (category.includes(',')) {
        // Multiple categories
        const categories = category.split(',').map(c => c.trim());
        filter.category = { $in: categories };
      } else {
        // Single category
        filter.category = category;
      }
    }

    // Filter by price range
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }

    // Filter by minimum rating
    if (minRating) {
      filter.rating = { $gte: Number(minRating) };
    }

    // Filter by vendor id
    if (vendor) {
      try {
        filter.vendor = new mongoose.Types.ObjectId(vendor);
      } catch (e) {
        // invalid id - ensure no results
        filter.vendor = null;
      }
    }

    // Filter by recent review/update date (expects ISO string)
    if (updatedSince) {
      try {
        const d = new Date(updatedSince);
        if (!isNaN(d.getTime())) {
          filter.latestReviewAt = { $gte: d };
        }
      } catch (e) {
        // ignore parse errors
      }
    }

    // Build sort options
    let sortOptions = {};
    switch (sort) {
      case 'price_asc':
        sortOptions = { price: 1 };
        break;
      case 'price_desc':
        sortOptions = { price: -1 };
        break;
      case 'rating':
        sortOptions = { rating: -1 };
        break;
      case 'newest':
        sortOptions = { createdAt: -1 };
        break;
      default:
        sortOptions = { createdAt: -1 };
    }

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Get total count for pagination info
    const total = await Product.countDocuments(filter);

    // Fetch products with pagination
    const products = await Product.find(filter)
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum);

    // Get all unique categories for filter options
    const categories = await Product.distinct('category');

    // Get unique vendors referenced by products for filter options
    const vendorIds = (await Product.distinct('vendor')).filter(id => id);
    let vendors = [];
    if (vendorIds && vendorIds.length > 0) {
      const users = await User.find({ _id: { $in: vendorIds } }).select('displayName name avatar vendorProfile.storeName');
      vendors = users.map(u => ({ _id: u._id, name: u.name, displayName: u.displayName, storeName: u.vendorProfile?.storeName || null, avatar: u.avatar }));
    }

    // Get price range for filter options
    const priceStats = await Product.aggregate([
      { $group: { _id: null, minPrice: { $min: '$price' }, maxPrice: { $max: '$price' } } }
    ]);
    const priceRange = priceStats[0] || { minPrice: 0, maxPrice: 10000 };

    res.status(200).json({
      products,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
        hasMore: pageNum * limitNum < total,
      },
      filters: {
        categories: ['All', ...categories],
        priceRange: { min: priceRange.minPrice, max: priceRange.maxPrice },
        // expose rating min to help frontend UIs
        rating: { min: 0, max: 5 },
        vendors,
      },
    });
  } catch (error) {
    console.error(error);
    // Handle mongoose validation errors with helpful messages
    if (error && error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message).join(', ');
      return res.status(400).json({ message: messages });
    }
    // Forward other known errors
    if (error && error.message) {
      return res.status(500).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get single product
// @route   GET /api/products/:id
// @access  Public
const getProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.status(200).json(product);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Create a product
// @route   POST /api/products
// @access  Private (Admin only, but for simplicity, any authenticated user)
const createProduct = async (req, res) => {
  try {
    let { name, description, price, category, image, available, vendor, attributeGroups } = req.body;

    // If attributeGroups sent as JSON string (multipart/form-data), parse it
    if (attributeGroups && typeof attributeGroups === 'string') {
      try {
        attributeGroups = JSON.parse(attributeGroups);
      } catch (e) {
        // leave as-is and let validation handle it
      }
    }

    // Validate and sanitize product (including attributeGroups)
    const { errors, sanitized } = validateProduct({ name, description, price, category, attributeGroups });
    if (errors && errors.length) {
      return res.status(400).json({ message: errors.join(', ') });
    }

    const productData = {
      name: sanitized.name || name,
      description: sanitized.description || description,
      price: sanitized.price != null ? sanitized.price : price,
      category: sanitized.category || category,
      attributeGroups: sanitized.attributeGroups,
      image: image || '',
      available: typeof available === 'boolean' ? available : true,
    };

    // assign vendor: if current user is vendor use their id, otherwise allow vendor field (admin)
    if (req.user && req.user.role === 'vendor') {
      productData.vendor = req.user._id;
    } else if (vendor) {
      productData.vendor = vendor;
    }

    // If an image file was uploaded (multer memoryStorage), upload to Cloudinary
    if (req.file && req.file.buffer) {
      const dataUri = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
      const uploadResult = await cloudinary.uploader.upload(dataUri, {
        folder: 'products',
        resource_type: 'image',
        overwrite: true,
      });
      if (uploadResult && uploadResult.secure_url) {
        productData.image = uploadResult.secure_url;
      }
    }

    const product = await Product.create(productData);

    // Emit real-time update to product subscribers
    const io = req.app.get('io');
    if (io) io.to('products').emit('productUpdate', { action: 'create', product });

    res.status(201).json(product);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Update a product
// @route   PUT /api/products/:id
// @access  Private
const updateProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Only allow vendor owner to update their product (unless admin)
    if (req.user && req.user.role === 'vendor') {
      if (!product.vendor || product.vendor.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Not authorized to update this product' });
      }
    }

    // validate incoming update fields if attributeGroups present
    const updateData = { ...req.body };
    if (req.body.attributeGroups) {
      // If attributeGroups sent as JSON string (multipart/form-data), parse it
      let incomingAttrGroups = req.body.attributeGroups;
      if (incomingAttrGroups && typeof incomingAttrGroups === 'string') {
        try {
          incomingAttrGroups = JSON.parse(incomingAttrGroups);
        } catch (e) {
          // leave as-is and let validation handle it
        }
      }

      // When validating attributeGroups on update, include existing product fields
      // so validateProduct doesn't treat missing top-level fields as errors.
      const toValidate = {
        name: product.name,
        description: product.description,
        price: product.price,
        category: product.category,
        attributeGroups: incomingAttrGroups
      };
      const { errors, sanitized } = validateProduct(toValidate);
      if (errors && errors.length) {
        return res.status(400).json({ message: errors.join(', ') });
      }
      updateData.attributeGroups = sanitized.attributeGroups;
    }
    if (req.file && req.file.buffer) {
      const dataUri = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
      const uploadResult = await cloudinary.uploader.upload(dataUri, {
        folder: 'products',
        resource_type: 'image',
        overwrite: true,
      });
      if (uploadResult && uploadResult.secure_url) {
        updateData.image = uploadResult.secure_url;
      }
    }

    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    // Emit real-time update to product subscribers
    const io = req.app.get('io');
    if (io) io.to('products').emit('productUpdate', { action: 'update', product: updatedProduct });

    res.status(200).json(updatedProduct);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Delete a product
// @route   DELETE /api/products/:id
// @access  Private
const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    await Product.findByIdAndDelete(req.params.id);

    // Emit real-time update to product subscribers
    const io = req.app.get('io');
    if (io) io.to('products').emit('productUpdate', { action: 'delete', productId: req.params.id });

    res.status(200).json({ message: 'Product removed' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
};
const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a product name'],
    trim: true,
  },
  description: {
    type: String,
    required: [true, 'Please add a description'],
  },
  price: {
    type: Number,
    required: [true, 'Please add a price'],
    min: 0,
  },
  attributeGroups: {
    type: [
      {
        key: String,
        title: String,
        type: { type: String, enum: ['single-select', 'multi-select'], default: 'single-select' },
        optional: { type: Boolean, default: true },
        requiredMin: { type: Number, default: 0 },
        attributes: [
          {
            name: String,
            priceType: { type: String, enum: ['flat', 'percent', 'minus-flat', 'minus-percent'], default: 'flat' },
            amount: { type: Number, default: 0 },
            quantityEnabled: { type: Boolean, default: false },
            defaultSelected: { type: Boolean, default: false }
          }
        ]
      }
    ],
    default: []
  },
  category: {
    type: String,
    required: [true, 'Please add a category'],
    enum: [
      'Beverages', 'Biryani', 'Burgers', 'Desserts', 'Japanese', 'Noodles',
      'Pizzas', 'Salads', 'Sandwiches', 'Seafood', 'Sides', 'Wraps'
    ],
  },
  image: {
    type: String, // URL to image
    default: '',
  },
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  available: {
    type: Boolean,
    default: true,
  },
  rating: {
    type: Number,
    default: 0,
  },
  reviewCount: {
    type: Number,
    default: 0,
  },
  latestReviewAt: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Product', productSchema);
const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  name: String,
  price: Number,
  quantity: Number,
  options: Object,
  // attribute selection snapshot
  selectedAttributes: [{
    id: { type: mongoose.Schema.Types.ObjectId },
    name: String,
    priceType: { type: String, enum: ['flat', 'percent', 'minus-flat', 'minus-percent'], default: 'flat' },
    amount: { type: Number, default: 0 },
    quantity: { type: Number, default: 1 },
    computedAmount: { type: Number, default: 0 }
  }],
  attributesTotal: { type: Number, default: 0 },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  vendorRevenue: { type: Number, default: 0 },
  preparing: { type: Boolean, default: false },
  preparingAt: { type: Date, default: null },
  ready: { type: Boolean, default: false },
  readyAt: { type: Date, default: null },
  visited: { type: Boolean, default: false },
  visitedAt: { type: Date, default: null },
});

const orderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  driver: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver' },
  assignedAt: { type: Date },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  items: [orderItemSchema],
  address: Object,
  vendorAddress: { type: Object, default: null },
  vendorAddresses: [{ vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, address: Object, visited: { type: Boolean, default: false }, visitedAt: { type: Date, default: null } }],
  vendorCount: { type: Number, default: 1 },
  viewers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  subtotal: { type: Number, default: 0 },
  promoAmount: { type: Number, default: 0 },
  promoCode: { type: String, default: '' },
  deliveryFee: { type: Number, default: 0 },
  appCharge: { type: Number, default: 0 },
  platformFee: { type: Number, default: 0 },
  platformCut: { type: Number, default: 0 },
  driverPlatformCut: { type: Number, default: 0 },
  driverRevenue: { type: Number, default: 0 },
  salesTax: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  payment: {
    status: { type: String, default: 'pending' },
    provider: String,
    method: { type: String, default: 'unknown' },
    cardId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentMethod', default: null },
    providerResponse: Object,
  },
  status: { type: String, default: 'order_placed' },
  deliveryNote: { type: String, default: '' },
  serviceType: { type: String, enum: ['delivery','pickup'], default: 'delivery' },
}, { timestamps: true });

// Pre-save hook to compute per-item vendorRevenue and driverRevenue and totals
orderSchema.pre('save', async function(next) {
  try {
    // compute subtotal from items (include attributesTotal per item)
    const items = this.items || [];
    const subtotal = items.reduce((s, it) => {
      const base = (it.price || 0) + (it.attributesTotal || 0);
      return s + base * (it.quantity || 1);
    }, 0);
    this.subtotal = subtotal;

    // promoAmount may be present; distribute proportionally across items
    const promoAmount = this.promoAmount || 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const itemSubtotal = ((it.price || 0) + (it.attributesTotal || 0)) * (it.quantity || 1);
      let itemPromoShare = 0;
      if (subtotal > 0 && promoAmount > 0) itemPromoShare = Math.round(((itemSubtotal / subtotal) * promoAmount) * 100) / 100;
      const itemNet = Math.round((itemSubtotal - itemPromoShare) * 100) / 100;
      // try to preserve vendorRevenue if already set
      if (typeof it.vendorRevenue === 'undefined' || it.vendorRevenue === null) it.vendorRevenue = itemNet;
      // try to resolve vendor from product if not present
      if ((!it.vendor || it.vendor === null) && it.product) {
        try {
          const Product = require('./Product');
          const prod = await Product.findById(it.product).select('vendor');
          if (prod && prod.vendor) it.vendor = prod.vendor;
        } catch (e) { /* ignore */ }
      }
    }

    // deliveryFee and appCharge are expected to be set by business logic; compute driverRevenue if missing
    if ((typeof this.driverRevenue === 'undefined' || this.driverRevenue === null || this.driverRevenue === 0) && this.deliveryFee != null) {
      const platformFromDelivery = Math.round((this.deliveryFee * 0.05) * 100) / 100;
      this.driverRevenue = Math.round((this.deliveryFee - platformFromDelivery) * 100) / 100;
    }

    // recompute platformFee if missing
    if ((typeof this.platformFee === 'undefined' || this.platformFee === null || this.platformFee === 0)) {
      const appCharge = this.appCharge != null ? this.appCharge : 0;
      const platformFromDelivery = this.deliveryFee != null ? Math.round((this.deliveryFee * 0.05) * 100) / 100 : 0;
      this.platformFee = Math.round((appCharge + platformFromDelivery) * 100) / 100;
    }

    // total = (subtotal - promo) + deliveryFee + platformFee + salesTax
    const pf = this.platformFee != null ? this.platformFee : 0;
    this.total = Math.round((((this.subtotal || 0) - (this.promoAmount || 0)) + (this.deliveryFee || 0) + (pf || 0) + (this.salesTax || 0)) * 100) / 100;

    next();
  } catch (e) {
    console.error('Order pre-save hook error', e);
    next();
  }
});

module.exports = mongoose.model('Order', orderSchema);

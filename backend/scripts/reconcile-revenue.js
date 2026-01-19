/**
 * Backfill order.driverRevenue and order.items.vendorRevenue where missing.
 * Usage:
 *   node reconcile-revenue.js --dry
 *   node reconcile-revenue.js --apply
 */
const mongoose = require('mongoose');
const Order = require('../src/models/Order');
const Product = require('../src/models/Product');
require('dotenv').config({ path: __dirname + '/../.env' });

async function round2(v) { return Math.round(v * 100) / 100; }

const { computeOrderTotals } = require('../src/utils/orderTotals');

async function processOrder(o, apply) {
  let changed = false;
  // Include attributesTotal (if present) in per-item price used for totals
  const items = (o.items || []).map(it => ({ price: (Number(it.price || 0) + Number(it.attributesTotal || 0)), quantity: it.quantity || 0, vendor: it.vendor }));
  const promo = (o.promoAmount && o.promoAmount > 0) ? { type: 'flat', amount: o.promoAmount } : (o.promoPercent ? { type: 'percent', amount: o.promoPercent } : null);
  const totals = await computeOrderTotals(items, promo, { salesTax: o.salesTax });

  // ensure items have vendorRevenue
  const newItems = [];
  const vendorMap = {};
  for (const it of o.items) {
    const itemSubtotal = (Number(it.price || 0) + Number(it.attributesTotal || 0)) * (it.quantity || 0);
    const vid = it.vendor ? String(it.vendor) : '_unknown';
    vendorMap[vid] = (vendorMap[vid] || 0) + itemSubtotal;
  }
  for (const it of o.items) {
    const itemSubtotal = (Number(it.price || 0) + Number(it.attributesTotal || 0)) * (it.quantity || 0);
    const vid = it.vendor ? String(it.vendor) : '_unknown';
    const vendorInfo = totals.vendorCuts[vid] || { vendorSubtotal: 0, vendorCut: 0 };
    const vendorSubtotal = vendorInfo.vendorSubtotal || vendorMap[vid] || 0;
    const vendorCut = vendorInfo.vendorCut || 0;
    const itemVendorRevenue = vendorSubtotal > 0 ? Math.round((itemSubtotal / vendorSubtotal) * vendorCut * 100) / 100 : 0;
    const vendorRevenue = (it.vendorRevenue != null && it.vendorRevenue !== 0) ? it.vendorRevenue : itemVendorRevenue;
    if (vendorRevenue !== it.vendorRevenue) changed = true;
    newItems.push({ ...it.toObject ? it.toObject() : it, vendor: it.vendor, vendorRevenue });
  }

  // ensure driverRevenue exists and matches computed driverCut
  let driverRevenue = o.driverRevenue || 0;
  if (Math.abs((totals.driverCut || 0) - (o.driverRevenue || 0)) > 0.009) {
    driverRevenue = totals.driverCut;
    changed = true;
  }

  if (changed && apply) {
    const update = {
      items: newItems,
      driverRevenue,
      platformCut: totals.platformCut,
      salesTax: totals.salesTax,
      promoAmount: totals.promoAmount,
      subtotal: totals.subtotal,
      deliveryFee: totals.deliveryFee,
      platformFee: totals.platformFee,
      total: totals.customerPayAmount,
      driverPlatformCut: totals.driverPlatformCut
    };
    await Order.findByIdAndUpdate(o._id, { $set: update }, { new: true }).exec();
    return { id: o._id, applied: true };
  }

  return { id: o._id, wouldChange: changed };
}

async function run() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  console.log('Connecting to MongoDB...', process.env.MONGO_URI);
  await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected');

  const cursor = Order.find().cursor();
  let total = 0, changedCount = 0;
  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    total += 1;
    try {
      const res = await processOrder(doc, apply);
      if (res.applied || res.wouldChange) changedCount += 1;
      if (apply && res.applied) console.log('Applied:', res.id.toString());
      else if (!apply && res.wouldChange) console.log('Would change:', res.id.toString());
    } catch (e) {
      console.warn('Failed processing', doc._id.toString(), e.message);
    }
  }

  console.log('Done. Scanned', total, 'orders. Changed/would-change:', changedCount, 'apply=', apply);
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });

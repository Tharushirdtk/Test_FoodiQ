// Centralized order totals and revenue allocation calculations
// Implements formulas provided by the product owner.

async function round2(v) { return Math.round((v || 0) * 100) / 100; }

/**
 * items: array of { price, quantity, vendor? }
 * promo: { type: 'percent'|'flat', amount: number }  // amount is percent (e.g. 10) when type=percent, or flat currency when flat
 * opts: { salesTax?: number }
 */
async function computeOrderTotals(items, promo = null, opts = {}) {
  // recipients counted as: all unique vendors + driver + platform
  const uniqueVendors = items && Array.isArray(items)
    ? Array.from(new Set(items.map(it => it && it.vendor ? String(it.vendor) : '_unknown')))
    : [];
  const recipientsCount = uniqueVendors.length + 2; // vendors + driver + platform
  // Determine sales tax handling:
  // - If `opts.salesTaxShare` is provided, treat it as the per-recipient share (legacy)
  // - Else if `opts.salesTax` is provided, treat it as the TOTAL sales tax charged to customer
  // - Otherwise default TOTAL sales tax = 50 (Rs50 charged to customer)
  let totalSalesTax;
  let perRecipientShare;
  if (opts.salesTaxShare != null) {
    perRecipientShare = Number(opts.salesTaxShare);
    totalSalesTax = perRecipientShare * (recipientsCount || 1);
  } else if (opts.salesTax != null) {
    totalSalesTax = Number(opts.salesTax);
    perRecipientShare = totalSalesTax / (recipientsCount || 1);
  } else {
    totalSalesTax = 50; // default total charged to customer
    perRecipientShare = totalSalesTax / (recipientsCount || 1);
  }
  const salesTax = await round2(totalSalesTax);
  perRecipientShare = await round2(perRecipientShare);

  const subtotal = items && Array.isArray(items)
    ? items.reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.quantity) || 1), 0)
    : 0;

  const deliveryFee = await round2(subtotal * 0.10); // 10%
  const platformFee = await round2((subtotal + deliveryFee) * 0.05); // 5% of (subtotal + delivery)

  const customerPayBeforePromo = await round2(subtotal + deliveryFee + platformFee);

  let promoAmount = 0;
  let promoPercent = 0;
  if (promo && promo.type === 'percent' && Number(promo.amount)) {
    promoPercent = Number(promo.amount) / 100;
    promoAmount = await round2(customerPayBeforePromo * promoPercent);
  } else if (promo && promo.type === 'flat' && Number(promo.amount)) {
    promoAmount = Number(promo.amount);
    promoPercent = customerPayBeforePromo > 0 ? (promoAmount / customerPayBeforePromo) : 0;
  }

  // Driver cut before platform share (allocation of promo to delivery fee)
  let driverCutBeforeSalesTax = 0;
  if (promo && promo.type === 'percent') {
    driverCutBeforeSalesTax = await round2(deliveryFee - (deliveryFee * promoPercent));
  } else {
    // flat promo allocated proportionally to delivery fee
    driverCutBeforeSalesTax = await round2(deliveryFee - (promoAmount * (deliveryFee / (customerPayBeforePromo || 1))));
  }

  // Platform's 5% share on the driver's portion
  const driverPlatformCut = await round2(driverCutBeforeSalesTax * 0.05);
  // Driver final cut: after platform share, then subtract flat salesTaxShare
  let driverCut = await round2(driverCutBeforeSalesTax - driverPlatformCut);
  driverCut = await round2(Math.max(0, driverCut - perRecipientShare));

  // Vendor totals and vendor cuts
  const vendorTotals = {}; // vendorId -> subtotal
  for (const it of (items || [])) {
    const vid = it.vendor ? String(it.vendor) : '_unknown';
    const itemSubtotal = (Number(it.price) || 0) * (Number(it.quantity) || 1);
    vendorTotals[vid] = (vendorTotals[vid] || 0) + itemSubtotal;
  }

  const vendorCuts = {}; // vendorId -> { vendorSubtotal, vendorCut }
  for (const vid of Object.keys(vendorTotals)) {
    const vendorSubtotal = await round2(vendorTotals[vid]);
    let vendorCut = 0;
    if (promo && promo.type === 'percent') {
      vendorCut = await round2(vendorSubtotal - (vendorSubtotal * promoPercent));
    } else {
      vendorCut = await round2(vendorSubtotal - (promoAmount * (vendorSubtotal / (customerPayBeforePromo || 1))));
    }
    // Subtract per-recipient share of sales tax from each vendor's cut
    vendorCut = await round2(Math.max(0, vendorCut - perRecipientShare));
    vendorCuts[vid] = { vendorSubtotal, vendorCut };
  }

  // Platform cut: platformFee reduced by promo allocation + platform's share of driver portion
  let platformCut = 0;
  if (promo && promo.type === 'percent') {
    platformCut = await round2((platformFee - (platformFee * promoPercent)) + driverPlatformCut);
  } else {
    platformCut = await round2((platformFee - (promoAmount * (platformFee / (customerPayBeforePromo || 1)))) + driverPlatformCut);
  }

  // Final customer pay amount: apply promo first, then add sales tax
  const customerPayAmount = await round2((customerPayBeforePromo - promoAmount) + salesTax);

  return {
    subtotal: await round2(subtotal),
    deliveryFee,
    platformFee,
    salesTax,
    customerPayBeforePromo,
    promoAmount: await round2(promoAmount),
    promoPercent: await round2(promoPercent),
    driverCutBeforeSalesTax: await round2(driverCutBeforeSalesTax),
    driverPlatformCut,
    driverCut,
    vendorCuts,
    platformCut,
    customerPayAmount
  };
}

module.exports = { computeOrderTotals };

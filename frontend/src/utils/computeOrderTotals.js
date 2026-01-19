// Frontend mirror of backend computeOrderTotals for UX preview
function round2(v) { return Math.round((v || 0) * 100) / 100; }

/**
 * items: array of { price, quantity, vendor? }
 * promo: { discountType: 'percent'|'flat', amount: number } (matches frontend voucher shape)
 * opts: { salesTax?: number, salesTaxShare?: number }
 */
function computeOrderTotals(items, promo = null, opts = {}) {
  const uniqueVendors = items && Array.isArray(items)
    ? Array.from(new Set(items.map(it => it && it.vendor ? String(it.vendor) : '_unknown')))
    : [];
  const recipientsCount = uniqueVendors.length + 2; // vendors + driver + platform

  // Determine sales tax handling: prefer total salesTax (opts.salesTax) or default total=50
  let totalSalesTax;
  let perRecipientShare;
  if (opts.salesTaxShare != null) {
    perRecipientShare = Number(opts.salesTaxShare);
    totalSalesTax = perRecipientShare * (recipientsCount || 1);
  } else if (opts.salesTax != null) {
    totalSalesTax = Number(opts.salesTax);
    perRecipientShare = totalSalesTax / (recipientsCount || 1);
  } else {
    totalSalesTax = 50;
    perRecipientShare = totalSalesTax / (recipientsCount || 1);
  }
  const salesTax = round2(totalSalesTax);
  perRecipientShare = round2(perRecipientShare);

  const subtotal = items && Array.isArray(items)
    ? items.reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.quantity) || 1), 0)
    : 0;

  const deliveryFee = round2(subtotal * 0.10);
  const platformFee = round2((subtotal + deliveryFee) * 0.05);

  const customerPayBeforePromo = round2(subtotal + deliveryFee + platformFee);

  let promoAmount = 0;
  let promoPercent = 0;
  if (promo && (promo.discountType === 'percent' || promo.type === 'percent') && Number(promo.amount)) {
    promoPercent = Number(promo.amount) / 100;
    promoAmount = round2(customerPayBeforePromo * promoPercent);
  } else if (promo && (promo.discountType === 'flat' || promo.type === 'flat') && Number(promo.amount)) {
    promoAmount = Number(promo.amount);
    promoPercent = customerPayBeforePromo > 0 ? (promoAmount / customerPayBeforePromo) : 0;
  }

  const customerPayAmount = round2((customerPayBeforePromo - promoAmount) + salesTax);

  return {
    subtotal: round2(subtotal),
    deliveryFee,
    platformFee,
    salesTax,
    customerPayBeforePromo,
    promoAmount: round2(promoAmount),
    promoPercent: round2(promoPercent),
    total: customerPayAmount
  };
}

export { computeOrderTotals };

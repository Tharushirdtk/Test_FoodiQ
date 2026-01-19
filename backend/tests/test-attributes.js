const assert = require('assert');
const { computeOrderTotals } = require('../src/utils/orderTotals');

function round2(v) { return Math.round((v || 0) * 100) / 100; }

function computeAttributeAmount(attr, productBasePrice) {
  const qty = Number(attr.quantity) || 1;
  if (attr.priceType === 'percent') {
    return round2(productBasePrice * (Number(attr.amount) / 100)) * qty;
  }
  return round2(Number(attr.amount) || 0) * qty;
}

async function run() {
  console.log('Running attribute calculation tests...');

  // Test percent attribute calculation uses provided base price
  const base = 2000;
  const percentAttr = { priceType: 'percent', amount: 5, quantity: 1 };
  const pctAmount = computeAttributeAmount(percentAttr, base);
  assert.strictEqual(pctAmount, 100, '5% of 2000 should be 100');

  // Test flat attribute with quantity
  const flatAttr = { priceType: 'flat', amount: 150, quantity: 2 };
  const flatAmount = computeAttributeAmount(flatAttr, base);
  assert.strictEqual(flatAmount, 300, 'flat 150 x2 should be 300');

  // Combined example: base 2000, size +200 (applied to base), percent 5 on baseWithSize => 110
  const sizeAdd = 200;
  const baseWithSize = base + sizeAdd; // 2200
  const pctAttr = { priceType: 'percent', amount: 5, quantity: 1 };
  const pctOnSize = computeAttributeAmount(pctAttr, baseWithSize);
  assert.strictEqual(pctOnSize, 110, '5% of 2200 should be 110');

  // attributesTotal excludes size (size added to base), so attributesTotal = pctOnSize + flat extras
  const extrasTotal = flatAmount; // 300
  const attributesTotal = pctOnSize + extrasTotal; // 110 + 300 = 410

  // The item.price passed to computeOrderTotals should be baseWithSize + attributesTotal
  const itemUnitPrice = baseWithSize + attributesTotal; // 2200 + 410 = 2610

  const items = [{ price: itemUnitPrice, quantity: 1, vendor: 'v1' }];
  const totals = await computeOrderTotals(items, null, {});

  // Expected subtotal
  assert.strictEqual(totals.subtotal, round2(itemUnitPrice), 'Subtotal must equal item unit price');

  // Check deliveryFee = 10% of subtotal
  assert.strictEqual(totals.deliveryFee, round2(totals.subtotal * 0.10), 'Delivery fee 10% check');

  // Check platformFee = 5% of (subtotal + delivery)
  assert.strictEqual(totals.platformFee, round2((totals.subtotal + totals.deliveryFee) * 0.05), 'Platform fee 5% check');

  // Check customerPayAmount = (subtotal + delivery + platform) + salesTax (default 50)
  const expectedCustomerPayBeforePromo = round2(totals.subtotal + totals.deliveryFee + totals.platformFee);
  const expectedCustomerPay = round2(expectedCustomerPayBeforePromo + 50);
  assert.strictEqual(totals.customerPayBeforePromo, expectedCustomerPayBeforePromo, 'customerPayBeforePromo check');
  assert.strictEqual(totals.salesTax, 50, 'default salesTax should be 50');
  assert.strictEqual(totals.customerPayAmount, expectedCustomerPay, 'customerPayAmount final check');

  console.log('All attribute tests passed.');
}

run().catch(err => {
  console.error('Tests failed:', err);
  process.exit(2);
});

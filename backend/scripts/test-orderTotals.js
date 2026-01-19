const { computeOrderTotals } = require('../src/utils/orderTotals');

(async () => {
  const items = [
    { price: 200, quantity: 1, vendor: 'v1' },
  ];
  const totals = await computeOrderTotals(items, null, {});
  console.log('Computed totals:', totals);
})();

Feature: Product Attribute Groups (Vendor Addons)
===============================================

Overview
--------
This feature introduces flexible, vendor-defined "attribute groups" for products that let vendors add dynamic addons (sizes, extras, spice level, etc.). Attributes affect the Cart, Checkout, Order models and the centralized totals calculations.

High-level rules (from requirements)
- No UI design variants — a single presentation per type.
- Support `single-select` (exactly one choice; mandatory groups must have a default), and `multi-select` (zero or more selections).
- Each attribute has a `priceType` of `flat` or `percent` (no negative values). Percent is always applied against the product base price (including size adjustments described below).
- Each attribute supports a `quantity` (integer >= 1). Vendors may choose whether attribute-level quantity is enabled.
- `size` attribute group is required for products; it must have a `Regular` option (price 0) selected by default.
- Attribute amounts are added to the cart item amount before all other existing calculations (delivery fee, platformFee, promo, sales tax, etc.).

Data model changes (recommended)
--------------------------------

Product schema (add `attributeGroups` array)

attributeGroup: {
  _id: ObjectId,
  key: String,            // machine-friendly key (e.g., "size", "extras")
  title: String,          // vendor-visible title (e.g., "Size", "Add Extras")
  type: String,           // 'single-select' | 'multi-select'
  optional: Boolean,      // true if customer may skip selections
  requiredMin: Number,    // minimum selections required (1 if mandatory single-select)
  attributes: [
    {
      _id: ObjectId,
      name: String,
      priceType: String,    // 'flat' | 'percent'
      amount: Number,       // currency if flat, percentage (0-100) when percent
      quantityEnabled: Boolean, // allow quantity per attribute
      defaultSelected: Boolean // for single-select groups indicates the default option
    }
  ]
}

Notes:
- `size` group should be stored/created by vendors as a `single-select` group. One attribute should be marked `defaultSelected: true` and have amount 0 for "Regular".
- `priceType: 'percent'` means: attribute charge = round2(productBasePrice * (amount / 100)). `productBasePrice` is the product's price for the selected size (if sizes affect the base). Percent should be calculated against the base price snapshot used for the cart item.

CartItem / Order item changes
- Add `selectedAttributes` to cart items and order items. Each selected attribute is a snapshot of the attribute at selection time:

selectedAttribute: {
  id: ObjectId, // attribute id from product
  name: String,
  priceType: 'flat'|'percent',
  amount: Number, // the raw value stored on attribute
  quantity: Number, // selected attribute quantity (>=1)
  computedAmount: Number // currency amount contributed by this attribute (snapshot)
}

- Cart item `price` should represent the product base price (including chosen size amount). An additional `attributesTotal` field (or include in `itemSubtotal`) should represent sum of computed attribute amounts (quantity accounted for). `itemSubtotal` = (price + attributesTotal) * quantity (item quantity still applies to whole item).

Backend behavior & totals
- When adding to cart or creating an order, compute attribute `computedAmount` for each selected attribute and store snapshot in cart/order item.
- Compute percent attributes as: percentAmount = round2(productBasePrice * (attr.amount / 100)) * attr.quantity.
- Compute flat attributes as: flatAmount = round2(attr.amount) * attr.quantity.
- The item-level subtotal used by `computeOrderTotals` is the product base price + sum(selected attribute computed amounts) (then multiplied by item quantity).
- All existing totals calculations remain the same after adding attributes — i.e., deliveryFee, platformFee, promoAmount calculations operate on subtotal that includes attribute amounts.

API changes
- Product endpoints (GET/POST/PUT) should accept and return `attributeGroups` for vendors. The product creation UI must enforce `size` group presence and default `Regular` selection.
- Cart endpoints must accept `selectedAttributes` with items and compute snapshot fields server-side (client may send `selectedAttributes` but server validates against product `attributeGroups`).
- Order create endpoint accepts items with `selectedAttributes` (or derives them from cart). The server computes all attribute computed amounts and persists them in order items.

Frontend behavior
- `Product` page renders product `attributeGroups` in order. For `single-select` groups (e.g., Size) render radio-like choices; for `multi-select` render checkboxes with attribute-level quantity controls when `quantityEnabled` is true.
- `Add to Cart` must validate required groups (e.g., `size`) are selected. If user clears all and the group is required, automatically fall back to group's default attribute.
- When the user updates attributes on a cart item, update the same cart item (not add a new line) — treat attributes as part of item identity for display, but allow in-place edit.
- Cart/Checkout should call the server to compute item snapshots (or compute the same logic client-side for preview) — make sure snapshots match server computations. The server is authoritative.

Examples

Example product snippet (server representation):

{
  _id: "...",
  title: "Crispy Chicken BBQ Burger",
  price: 1800,
  attributeGroups: [
    {
      key: "size",
      title: "Size",
      type: "single-select",
      optional: false,
      requiredMin: 1,
      attributes: [
        { _id: "a1", name: "Regular", priceType: "flat", amount: 0, quantityEnabled: false, defaultSelected: true },
        { _id: "a2", name: "Large", priceType: "flat", amount: 200, quantityEnabled: false }
      ]
    },
    {
      key: "extras",
      title: "Add Extras",
      type: "multi-select",
      optional: true,
      attributes: [
        { _id: "b1", name: "Extra Cheese", priceType: "flat", amount: 150, quantityEnabled: true },
        { _id: "b2", name: "Grilled Bacon", priceType: "flat", amount: 200, quantityEnabled: true },
        { _id: "b3", name: "Spicy Shot", priceType: "percent", amount: 5, quantityEnabled: false }
      ]
    }
  ]
}

Example cart item snapshot saved server-side:

{
  product: "...",
  name: "Crispy Chicken BBQ Burger",
  price: 1800, // product base (size-adjusted if Large selected)
  quantity: 1,
  selectedAttributes: [
    { id: "a2", name: "Large", priceType: "flat", amount: 200, quantity: 1, computedAmount: 200 },
    { id: "b1", name: "Extra Cheese", priceType: "flat", amount: 150, quantity: 1, computedAmount: 150 },
    { id: "b3", name: "Spicy Shot", priceType: "percent", amount: 5, quantity: 1, computedAmount: 100 } // 5% of base 2000
  ],
  attributesTotal: 450,
  itemSubtotal: 2450 // (price + attributesTotal) * quantity
}

Calculation ordering (summary)
1. Determine `productBasePrice` (product.price plus selected size attribute flat amount if size chosen as flat: vendors should define size as flat prices).
2. For each selected attribute: compute `computedAmount` (percent -> percent of productBasePrice; flat -> amount) * attribute.quantity.
3. Item subtotal = (productBasePrice + sum(computedAmount)) * item.quantity.
4. Order subtotal is sum of item subtotals. The existing `computeOrderTotals` then computes deliveryFee, platformFee, promo, salesTax, etc. using this subtotal.

Edge cases & validation
- Disallow negative attribute amounts.
- For `single-select` group, ensure exactly one selection exists (server should enforce and fall back to default if missing).
- For `multi-select`, `requiredMin` enforces minimum selected attributes (default 0 unless vendor sets otherwise).

Implementation notes / next steps
1. Add `attributeGroups` to `Product` schema and `selectedAttributes` to `CartItem` and `Order` item schema.
2. Update product create/edit API and vendor UI to manage groups; enforce `size` group creation with default "Regular".
3. Update cart endpoints and server logic to compute attribute `computedAmount` and store snapshots.
4. Update `computeOrderTotals` to accept per-item subtotals that include attributes (likely no change needed in formula, but ensure subtotal input includes attributes).
5. Add unit tests that verify percent calculations are based on `productBasePrice`, and end-to-end tests for cart → order amounts.

Testing notes
----------------
- Added `backend/tests/test-attributes.js` which:
  - Verifies percent and flat attribute computed amounts follow the documented formulas.
  - Validates that `computeOrderTotals` consumes an item `price` that already includes attributes (this mirrors backend behavior where `orderController` passes item price = baseWithSize + attributesTotal).
  - Run with:

```bash
node backend/tests/test-attributes.js
```

If you want, I can add a `npm test` script and convert these to a Jest suite for CI-friendly execution.

If this README looks good, I'll start with the schema patches for `Product` and `Order` and wire server-side snapshot computation.

Atomic implementation tasks (small, sequential)
---------------------------------------------
These are broken into bite-sized tasks I can implement one at a time. After I finish each task, I'll ask you to verify it's 100% before moving to the next.

Task A — Schema + snapshot fields (backend)
- Goal: Add persistent fields needed for attributes and snapshots.
- Files to change:
  - `backend/src/models/Product.js` — add `attributeGroups` array.
  - `backend/src/models/CartItem.js` — add `selectedAttributes`, `attributesTotal` (snapshot) and keep `options` for backwards compatibility.
  - `backend/src/models/Order.js` — extend `orderItemSchema` to include `selectedAttributes`, `attributesTotal` and ensure pre-save logic accounts for attribute amounts when computing `subtotal` and `vendorRevenue`.

Task B — Server: cart endpoints and socket flow
- Goal: accept `selectedAttributes` in add/update cart endpoints, compute snapshots server-side, and keep socket handlers in sync.
- Files to change:
  - `backend/src/controllers/cartController.js` — validate `selectedAttributes`, compute `computedAmount` per attribute, set `attributesTotal`, store `options.selectedAttributes` or a dedicated field.
  - `backend/src/routes/cart.js` — no new routes, but ensure validation expectations documented.
  - `backend/src/server.js` — socket `addToCart` / `updateCartItem` handlers should accept and persist `selectedAttributes` similarly.

Task C — Order creation + totals integration
- Goal: ensure order creation uses item price that includes attribute amounts and persists snapshots to orders; ensure totals util uses that subtotal.
- Files to change:
  - `backend/src/controllers/orderController.js` — when building `itemsWithVendor`, compute `attributesTotal` and use `price + attributesTotal` per item before calling `computeOrderTotals`; persist `selectedAttributes` and `attributesTotal` on order items.
  - `backend/src/utils/orderTotals.js` — confirm calculations operate on subtotal that includes attribute amounts (likely no change if `orderController` passes items with attribute amounts incorporated). Add tests to cover attributes.
  - `backend/scripts/reconcile-revenue.js` — update backfill logic to include attributes when re-computing orders.

Task D — Product CRUD & validation (vendor UI/backed)
- Goal: let vendors create/edit `attributeGroups` and enforce `size` presence/defaults.
- Files to change:
  - `backend/src/controllers/productController.js` (if present) and `backend/src/routes/products.js` — accept `attributeGroups` in create/update and validate required `size` group.
  - `backend/src/utils/validation.js` — extend `validateProduct` to require `size` group with a default `Regular` attribute when product is created by vendor.
  - `frontend/src/pages/VendorProducts.js` and related vendor product editor components — UI to add/edit `attributeGroups` and attributes (small incremental changes).

Task E — Frontend: product page, cart & checkout
- Goal: render attribute groups dynamically and include selections when adding/updating cart items; compute preview totals client-side to match server.
- Files to change:
  - `frontend/src/pages/ProductPage.js` — replace hard-coded `sizes`, `extras`, `spiceLevel` with dynamic `product.attributeGroups` rendering; send `selectedAttributes` to `addToCart`.
  - `frontend/src/context/CartContext.js` and `frontend/src/services/cartService.js` — ensure `addToCart`/`updateCartItem` accept `selectedAttributes` payloads and send to backend as `options`/`selectedAttributes`.
  - `frontend/src/pages/CartPage.js` and `frontend/src/pages/CheckoutPage.js` — show per-item attribute list and attributesTotal, allow editing attribute quantities, and call server to recompute snapshots.

Task F — Tests & docs
- Goal: add unit tests and finish documentation.
- Files to change/add:
  - `backend/tests/*` add tests exercising attribute price calculations and order totals.
  - Update `FEATURE_ATTRIBUTES.md` (this file) with usage examples (done), and add migration notes.

Files I identified in the repo that will need attention (quick scan)
- Backend models & controllers found: `backend/src/models/Product.js`, `CartItem.js`, `Order.js`, `backend/src/controllers/cartController.js`, `orderController.js`, `productController.js` (if present), `backend/src/server.js`, `backend/src/utils/orderTotals.js`, `backend/src/utils/validation.js`, `backend/src/routes/cart.js`, `backend/src/routes/products.js`.
- Frontend files found that will need updates: `frontend/src/pages/ProductPage.js`, `VendorProducts.js`, `CartPage.js`, `CheckoutPage.js`, `context/CartContext.js`, `services/cartService.js`, `services/productService.js`.

If this breakdown looks correct, tell me "Start Task A" and I'll implement Task A (schema updates + migrations notes). After implementing Task A I'll run lightweight checks and report back for your verification.

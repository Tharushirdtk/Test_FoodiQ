# Access Control Tasks & Summary

Date: 2026-01-15

This document summarizes current access-control status, answers your questions, and lists tasks to implement the requested behavior across the frontend.

---

<!-- High-level answers removed per user request. -->

## Wallet unification

- Task added: Unify `VendorWallet.js` into `WalletPage.js`. After unification the codebase should have a single `WalletPage` that renders vendor-specific UI when `user.role === 'vendor'`.

---

## Current routing and protection (short)
- Route-level protections live in `frontend/src/App.js`. Many routes are wrapped in `<ProtectedRoute requiredRoles=...>` which enforces role-based access at route mount time.
- Several pages also contain page-level checks (early-returns) for `user.phoneVerified` (drivers) and other conditional UI. These are inconsistent across pages.
- There is currently NO wildcard `*` route for 404 handling in `App.js`.

---

## Requested changes (per-page & behavior) — summary and current status
(This lists what you requested and whether it's implemented now.)

- `AddressesPage` — "dont show for vendor"
  - Current: route `/account/addresses` is protected for `customer,admin,vendor` in `App.js`. Needs change: remove `vendor` from required roles so vendors do not see the page (or keep route protection and hide the nav link for `vendor`).
- `FavoritesPage` — "dont show for vendor"
  - Current: `/account/favorites` requires `customer,admin,vendor`. Needs change: remove `vendor` role.
- `PaymentPage` — "dont show for vendor"
  - Current: `/account/payment` requires `customer,admin,vendor`. Needs change: remove `vendor` role.
- `WalletPage` and `VendorWallet` — you asked why separate
  - Answer given above. If you want consolidation we can implement single `Wallet` route that adapts per-role.
- `OrdersPage` — need more info + "show for supporters as well"
  - Current: `/orders` is protected `customer,admin,vendor`. Needs change: include `support` role and, for support users, show all orders regardless of status (and navigation to tracking).
- `OrderTrackingPage` — "show for supporters as well"
  - Current: `/order/:id` is public (no `ProtectedRoute`) and contains per-order, per-role checks. We will explicitly allow `support` (wrap with `ProtectedRoute` or add logic) and ensure support can view assignments.
- `ProductPage` — "only allow for drivers and admin"
  - Current: `/product/:id` currently redirects drivers to `/driver/orders` at route level but otherwise public for other roles. Needs change: restrict page to only `driver` and `admin` (or exactly as requested) — meaning wrap with `ProtectedRoute` for `["driver","admin"]` and deny others.
- `StorePage`, `CartPage`, `CheckoutPage` — "dont redirect any users... show not accessible for driver, vendor, support roles"
  - Current: `App.js` redirects `role === 'driver'` to driver pages for these routes. Change: stop redirecting and instead show consistent `AccessDenied` UI for drivers, vendors, and support users (allow customers and admin and guests as per guest rules).
- `SupportDashboard`, `SupportConversationPage` — "only allow admin and support roles"
  - Current: support routes use `ProtectedRoute` in `App.js` but ensure `/support/chat/:id` is protected by `support|admin` already. Confirm and tighten if needed.
- `SupportPage`, `SupportChatPage` — "should be accesible to all users"
  - Current: `/support` is routed via `SupportRouter` which returns `SupportDashboard` for support/admin and `SupportPage` otherwise. `/support/chat` route is currently protected for `customer,support,admin`. We'll ensure chat is accessible to all users where appropriate and adjust protections if needed.
- `HomePage` — redirect drivers, vendors, support and admin roles
  - Current: root `/` uses `AuthWrapper` and already redirects drivers to `DriverLanding`. We will implement vendor redirect to `/vendor/orders`, support to `/support` (or `/support` root which will route to the support dashboard if support/admin), and admin to `/admin`.
- Guests: "only the home page, store and profile should be accessible"
  - Current: guests and unauthenticated flows are partially handled in `AuthWrapper`. We'll explicitly ensure guest role only sees Home, Store, and Profile; other pages should show `Login` or `AccessDenied` depending on route.
- Deny UI should look the same everywhere, matching `FavoritesPage` style
  - Task: create a single `AccessDenied` component (styled like `FavoritesPage`) and replace per-page deny messages.
- All routes should be accessible by admin
  - Task: update `ProtectedRoute` usage to ensure admin is included for routes (or make `ProtectedRoute` treat `admin` as always allowed).
- Profile quick access and navigation bars: admin must see everything
  - Current: some nav items hide for admin. Task: ensure admin sees all quick access items, bottom nav and side nav entries.
- 404 handling
  - Current: no wildcard route. Task: add `NotFound` component and `<Route path="*" element={<NotFound />} />` in `App.js`.

---

## Bugs you reported (actions to fix)
- AdminDashboard -> User management -> role dropdown does not filter the list. (Task: fix filter state and ensure selection triggers `loadUsers` with the role filter.)
- Supporters: do not show Home in bottom navigation; reorder bottom nav for support to: Support, Search, Orders, Profile. (Task: adjust `BottomNav` logic.)
- OrdersPage for supporters: show all orders regardless of status and clicking an order opens OrderTracking for that order. (Task: adjust `OrdersPage` to show full list and use `navigate(`/order/${id}`)` for support users.)

---

## Implementation plan (high-level)
1. Create `components/AccessDenied.js` + CSS matching FavoritesPage style.
2. Create `components/NotFound.js` + simple 404 UI.
3. Update `App.js`:
   - Add wildcard route for 404.
   - Update route protections per your rules (see per-page list above).
   - Change `Store`, `Product`, `Cart`, `Checkout` routes to stop redirecting drivers; route-level `ProtectedRoute` or page-level `AccessDenied` will be shown for blocked roles.
4. Update pages that currently do their own deny UI to render `AccessDenied`.
5. Update `BottomNav` and navigation components to ensure admin sees everything; hide Home for support and reorder icons.
6. Fix `AdminDashboard` role filter bug.
7. Update `OrdersPage` for support behavior.
8. Run the app and test all role combinations and 404.

---

## Next actions I can take now (choose one or let me proceed):
- A) Create `AccessDenied` and `NotFound` components and add the wildcard route in `App.js` (quick, safe change).
- B) Produce and apply a patch that updates `App.js` route roles and `BottomNav` logic per your rules.
- C) Implement all changes end-to-end and run tests (larger change, will require local testing).

Tell me which you'd like me to execute first. If you want me to proceed with full changes, say "Do full implementation" and I'll start applying patches (I'll do them incrementally and test after each major change).

---

## Files to change (short checklist)
- `frontend/src/components/AccessDenied.js` (new)
- `frontend/src/components/NotFound.js` (new)
- `frontend/src/App.js` (update routing & wildcard)
- `frontend/src/components/BottomNav.js` or `App.js` bottom nav area (update support order)
- Pages: `FavoritesPage`, `AddressesPage`, `PaymentPage`, `OrderTrackingPage`, `OrdersPage`, `ProductPage`, `StorePage`, `CartPage`, `CheckoutPage`, `SupportDashboard`, `SupportConversationPage` — update to use `AccessDenied` where appropriate
- `frontend/src/pages/AdminDashboard.js` — fix role filter bug

- Unify note: consolidate `VendorWallet.js` into `WalletPage.js` and remove `VendorWallet.js` once consolidation is complete.

## Code-level Tasks (grouped)
**Routing**
- Add wildcard 404 route: `<Route path="*" element={<NotFound/>} />` inside `AuthWrapper` in `frontend/src/App.js`.
- Ensure admin is allowed on all routes by including `admin` in `ProtectedRoute` role lists or modify `ProtectedRoute` to allow admin always.
- Restrict `ProductPage` route to `driver` and `admin` (wrap with `ProtectedRoute requiredRoles={["driver","admin"]}`).
- Modify `OrdersPage` and `OrderTrackingPage` route access to include `support` where required.
- Remove driver redirects from `Store`, `Cart`, `Checkout` routes; show `AccessDenied` instead for blocked roles.
- Limit guest access to only Home, Store, and Profile routes (enforce in `AuthWrapper`).

**Components (new)**
- `frontend/src/components/AccessDenied.js` — reusable component styled like `FavoritesPage` deny UI.
- `frontend/src/components/NotFound.js` — 404 UI component.
- Shared CSS: `frontend/src/styles/AccessDenied.css` (or add to existing styles directory).

**Pages (per-file tasks)**
- `frontend/src/pages/AddressesPage.js`: remove vendor from allowed roles / show `AccessDenied` for vendor.
- `frontend/src/pages/FavoritesPage.js`: remove vendor from allowed roles / show `AccessDenied` for vendor.
- `frontend/src/pages/PaymentPage.js`: remove vendor from allowed roles / show `AccessDenied` for vendor.
- `frontend/src/pages/WalletPage.js`: merge vendor UI from `VendorWallet.js` and adapt by `user.role`.
- `frontend/src/pages/VendorWallet.js`: remove after merging into `WalletPage.js`.
- `frontend/src/pages/OrdersPage.js`: add `support` role; when `role==='support'` show all orders and navigate to `/order/:id` on click.
- `frontend/src/pages/OrderTrackingPage.js`: ensure `support` can view order details; enforce order-level access checks.
- `frontend/src/pages/ProductPage.js`: enforce `ProtectedRoute` or in-page `AccessDenied` so only `driver` and `admin` can access.
- `frontend/src/pages/StorePage.js`, `CartPage.js`, `CheckoutPage.js`: remove route-level driver redirect; instead in-page show `AccessDenied` for `driver`, `vendor`, `support`.
- `frontend/src/pages/DriverOrders.js`, `DriverOrderDetail.js`: keep phone-verified guard, but replace custom UI with `AccessDenied` component for consistency.
- `frontend/src/pages/SupportDashboard.js`, `SupportConversationPage.js`: ensure `ProtectedRoute requiredRoles={["support","admin"]}`.
- `frontend/src/pages/SupportPage.js`, `SupportChatPage.js`: ensure accessible to all authenticated users (or guests where intended).

**Navigation / BottomNav / Profile UI**
- `frontend/src/App.js` / BottomNav: hide Home for `support`; reorder for `support`: Support, Search, Orders, Profile.
- Ensure admin sees all quick access items, bottom nav icons, and side nav entries (remove admin-specific hiding conditions).

**Wallet**
- Merge `VendorWallet.js` into `WalletPage.js`:
  - Move vendor-specific panels and API calls into conditional blocks `if (user?.role === 'vendor')`.
  - Keep common wallet transaction list shared.
  - Update route in `App.js` to use single `/vendor/wallet` or `/wallet` as needed and remove duplicate route.

**Orders / Support behavior**
- `OrdersPage`: for `support` role, fetch all orders (remove status filters) and on order click `navigate(`/order/${order._id}`)`.
- `OrderTrackingPage`: ensure support can access and see order timeline; keep per-order denial for other roles when necessary.

**Standardization**
- Replace ad-hoc early-return deny blocks with `AccessDenied` for consistent look across pages.
- Centralize phone-verification check into a small helper `utils/guards.js` if reused.

**Testing & QA**
- Add manual test checklist in README: combinations for `customer`, `driver`, `vendor`, `support`, `admin`, and `guest`.
- Test cases: 404 page, `AccessDenied` appearance, Wallet pages for each role, OrdersPage behaviour for support, BottomNav reorder for support, AdminDashboard role filter.

**Docs**
- Update `ACCESS_CONTROL_AND_TASKS.md` with this code-level task list (done).
- After implementation, update README with routes matrix and testing results.

---

If this list looks good, tell me which step to start with. If you want the full implementation, say "Do full implementation" and I'll start applying patches (I'll do them incrementally and test after each major change).

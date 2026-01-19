Vendor & Analytics Feature Spec

This document captures requirements from the recent conversation and your confirmations. It records implemented decisions, outstanding questions, and next steps. Section 10 lists the remaining questions I need your answers to so I can finish the remaining work to 100%.

1) High-level goals (confirmed)
- Roles: `customer` (default), `vendor`, `driver`, `support`, `admin`.
- Phone verification: `phoneVerified === true` required for vendor and driver account creation (server enforces this).
- Vendor `location`: a structured address captured on vendor registration; label shown in the FE as `Location` (not `Address`). This is a presentation change only.
- Products: every `Product` includes `vendor: ObjectId` referencing `User._id`.
- Vendor pages: product management, vendor orders and vendor wallet/history will be available.
- Drivers: profile modal, rating flow, driver wallet/history pages with charts.
- Ratings: paginated (page size 5). Driver rating prompts are sent after order completion via notifications (see Q7).
- Analytics: `react-chartjs-2 + chart.js` used via a `TimeSeriesChart` component; default range = monthly.

2) Frontend details (confirmed)
- Chart ranges (confirmed): daily = last 30 days; weekly = last 12 weeks; monthly = last 12 months (default); yearly = last 5 years.
- Wallet UI: the chart sits above the empty-state; empty-state content is horizontally centered.
- Vendor `location` is displayed as `Location` across the FE wherever vendor addresses are shown.

3) Backend & Data Model changes (implemented / confirmed)
- `User` includes `role`, `vendorProfile`, and `driverProfile` fields. Server rejects `registerFull` for vendor/driver unless `phoneVerified` and required profile fields are present.
- `Product.vendor` field exists and product endpoints enforce ownership for edits.
- `Review`/`Rating` supports `entityType` and `entityId`.
- Cloudinary is used for product image uploads (credentials provided and configured).

4) API endpoints (summary)
- Auth: registration split into steps with phone verification before completing vendor/driver signup.
- Products: multipart uploads supported; vendor-only create/update/delete.
- Ratings: `GET` & `POST` endpoints with pagination.
- Analytics: revenue endpoints for driver/vendor/platform with `range` param.

5) Frontend routes / pages (status)
- Role selector added to registration steps, `RegisterStep2` collects vendor `location` and driver vehicle fields.
- `VendorProducts`, `VendorOrders`, `VendorWallet`, and `VendorHistory` pages scaffolded.
- `TimeSeriesChart`, `VendorModal`, and `DriverModal` created. `DriverModal` needs wiring into selected UI spots (see Q12).

6) UI/UX specifics & constraints (applied)
- Charts use theme colors via `TimeSeriesChart`.
- Ratings pagination set to 5.

7) Notification & rating flow (your instruction)
- You asked that driver ratings be allowed only after an order completes, and that rating prompts should be delivered via the notification system. You also asked that rating not be allowed from the driver details pop-up arbitrarily — rating should be through the notification after completion. I will review and complete the notification flows and implement the core triggers (see Q7 below for confirmation list of triggers and channels).

8) Vendor approval
- You confirmed no admin approval required for vendor accounts now. We will reserve `vendorProfile.approved` for future use.

9) Future enhancements
- Additional refinements (admin CSV vendor/date filters, UI polish) are noted as future enhancements.

10) Remaining questions (please answer)
Below are the specific items I need you to confirm so I can finish remaining items to 100%.

Answered items (recorded here):

A1 — Vendor `location` structure:
  - Store `street`, `city`, `state`, `postalCode`, `country`. On the frontend the `country` will be presented as a dropdown.

A2 — Driver vehicle and admin visibility:
  - `vehicleNumber` and `vehicleImage` are required for driver account creation. Images uploaded to Cloudinary.
  - Admins can view vehicle number and related details: clicking a user in the admin dashboard will open a user details modal showing full user information (vehicle number, vehicle image, etc.) — no ratings or review UI inside that modal.

A3 — Ratings & flow:
  - Rating mechanics confirmed: drivers/vendors can be rated only at appropriate times; driver rating prompts will be delivered via notifications after order completion. Drivers may rate vendors when appropriate via `VendorModal`.

A4 — Order statuses, vendor actions & notifications:
  - Orders cannot be cancelled after status is updated to `preparing your meal`.
  - Vendor controls: vendors see a `Prepare Meal` button which toggles to `Ready` once clicked. For single-vendor orders, vendor clicking `Prepare Meal` sets order status to `preparing your meal` for the customer; then clicking `Ready` sets order status to `ready for pickup`.
  - Multi-vendor orders: each vendor sees their own `Prepare Meal` / `Ready` buttons for their items.
    - When a vendor clicks `Prepare Meal`, the customer's order status should show `preparing your meal` and indicate which vendor(s) have started preparing.
    - When a vendor clicks `Ready`, it only sets that vendor's items as ready; the global order status changes to `ready for pickup` only when all vendors have marked their items `Ready`.
    - If some vendors are `Ready` while others are still `Preparing`, vendors who attempt to mark ready will see a message: "Waiting for other vendors to prepare their meals." Customers will see `preparing your meal` until all vendors mark ready.
  - Status lifecycle and notifications (who to notify at each change):
    - `order placed` — customer responsible (notify vendor(s) that order is placed)
    - `order confirmed` — vendor acknowledges (notify customer)
    - `preparing your meal` — vendor/vendors responsible (notify customer)
    - `ready for pickup` — vendor/vendors responsible (notify customer)
    - `driver assigned` — driver responsible (notify customer)
    - `out for delivery` — driver responsible (notify customer and vendors). Driver will stop at vendors in ordered list and mark each stop done; notify the relevant vendor when they are the next stop.
    - `order picked up` — driver responsible (notify customer)
    - `delivered` — driver responsible (notify customer and vendor/vendors)

A5 — Default vendor for backfills:
  - Create a `Default Vendor` user during migration/backfills; use its id for items where vendor cannot be inferred.

A6 — Modal wiring and order tracking:
  - The order tracking page will show vendor profiles to drivers while going through stops; drivers can click vendor avatars to open the `VendorModal` and rate vendors at the appropriate time.

A7 — Vehicle image constraints:
  - No special preference provided; default validation applied: accept JPG/PNG up to 5MB.

A8 — Chat & message notifications:
  - Notify users when there is a new message or reply in a chat they participate in. Clicking the notification should open the app and navigate the user directly to that specific chat thread.

A9 — Admin CSV exports:
  - Implement vendor-filtered and date-range CSV export now (per your request).
11) Suggested defaults if you prefer me to proceed without further answers
If you want me to continue immediately using safe defaults, confirm the following single statement and I will proceed:
- Use Cloudinary (already set), store vendor `location` as `street, city, state, postalCode, country` with optional `lat/lng`, make `vehicleNumber` and `vehicleImage` optional at registration and stored via Cloudinary, create `Default Vendor` during backfills (name: `Default Vendor`, email: `default-vendor@yourapp.local`), implement the notification triggers listed in Q4 as in-app notifications and queue email/SMS with 3 retry attempts, and wire `DriverModal` to `OrderTrackingPage` driver avatar and chat avatar clicks now.

12) Next steps after your answers
- I will update the README with your answers, then:
  1) Wire `DriverModal` triggers per Q6.
  2) Implement the notification triggers and rating prompt flow from Q4/Q3.
  3) Add driver vehicle upload UI + endpoint and hide vehicleNumber in public driver modal as confirmed.
  4) Finish any admin CSV refinements you requested.

Deliverables produced so far: backend schema changes, Cloudinary product uploads, analytics endpoints, migration script applied, frontend scaffolding for vendor/driver pages, `TimeSeriesChart`, `VendorModal`, and `DriverModal` components.

Please answer Q1–Q10 (or confirm the suggested defaults in section 11) and I will continue with the remaining implementation items.
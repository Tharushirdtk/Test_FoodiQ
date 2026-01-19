/**
 * migrate-normalize-users.js
 *
 * Updated migration:
 * - Removes driverProfile.location everywhere (deprecated)
 * - Ensures consistent driverProfile and vendorProfile shapes across all users
 * - Adds vendorProfile.description and vendorProfile.storePhoneVerified when missing
 * - Ensures registrationStep, preferences, phoneVerified defaults
 *
 * Usage:
 *   node migrate-normalize-users.js [--dry-run]
 *
 * Notes:
 * - By default this script WILL KEEP vendorProfile/driverProfile objects
 *   on non-matching roles but will set them to a consistent default shape.
 *   To remove profiles for non-matching roles, set REMOVE_PROFILES_FOR_NON_ROLE = true.
 */

const mongoose = require("mongoose");
require("dotenv").config();

const User = require("../src/models/User");

const MONGO =
  process.env.MONGO_URI ||
  process.env.DATABASE_URL ||
  "mongodb://localhost:27017/foodiq";
const BATCH_SIZE = 200;
const REMOVE_PROFILES_FOR_NON_ROLE = false; // change to true if you prefer removing vendor/driver profiles for non-matching roles

function ensureVendorProfileShape(vp) {
  if (!vp || typeof vp !== "object") vp = {};
  return {
    storeName: typeof vp.storeName !== "undefined" ? vp.storeName : null,
    storeAddress:
      vp.storeAddress && typeof vp.storeAddress === "object"
        ? vp.storeAddress
        : typeof vp.storeAddress === "string"
        ? { street: vp.storeAddress }
        : null,
    storePhone: typeof vp.storePhone !== "undefined" ? vp.storePhone : null,
    storePhoneVerified:
      typeof vp.storePhoneVerified !== "undefined"
        ? Boolean(vp.storePhoneVerified)
        : false,
    description: typeof vp.description !== "undefined" ? vp.description : null,
    businessRegNumber:
      typeof vp.businessRegNumber !== "undefined" ? vp.businessRegNumber : null,
    approved: typeof vp.approved !== "undefined" ? Boolean(vp.approved) : false,
  };
}

function ensureDriverProfileShape(dp) {
  if (!dp || typeof dp !== "object") dp = {};
  return {
    vehicleType: typeof dp.vehicleType !== "undefined" ? dp.vehicleType : null,
    vehicleNumber:
      typeof dp.vehicleNumber !== "undefined"
        ? dp.vehicleNumber
        : dp.licensePlate || null,
    vehicleImage:
      typeof dp.vehicleImage !== "undefined" ? dp.vehicleImage : null,
    licenseNumber:
      typeof dp.licenseNumber !== "undefined" ? dp.licenseNumber : null,
    rating: typeof dp.rating !== "undefined" ? dp.rating : 5,
    active: typeof dp.active !== "undefined" ? Boolean(dp.active) : false,
    assignedOrders: Array.isArray(dp.assignedOrders) ? dp.assignedOrders : [],
    // intentionally do NOT include `location`
  };
}

async function normalizeUser(u, opts = {}) {
  let changed = false;
  const allowedRoles = ["customer", "vendor", "driver", "support", "admin"];

  // normalize role
  if (!u.role || !allowedRoles.includes(u.role)) {
    u.role = "customer";
    changed = true;
  }

  // registrationStep
  if (
    typeof u.registrationStep === "undefined" ||
    u.registrationStep === null
  ) {
    u.registrationStep = 1;
    changed = true;
  }

  // preferences
  if (!u.preferences || typeof u.preferences !== "object") {
    u.preferences = { darkMode: false, pushNotifications: true };
    changed = true;
  } else {
    if (typeof u.preferences.darkMode === "undefined") {
      u.preferences.darkMode = false;
      changed = true;
    }
    if (typeof u.preferences.pushNotifications === "undefined") {
      u.preferences.pushNotifications = true;
      changed = true;
    }
  }

  // phoneVerified default
  if (typeof u.phoneVerified === "undefined") {
    u.phoneVerified = false;
    changed = true;
  }

  // driverProfile - remove deprecated `location` and ensure shape
  if (u.driverProfile && typeof u.driverProfile === "object") {
    if (u.driverProfile.location) {
      delete u.driverProfile.location;
      changed = true;
    }
  }

  // Ensure driverProfile consistent shape (keep for all users or remove for non-driver based on config)
  if (REMOVE_PROFILES_FOR_NON_ROLE) {
    if (u.role !== "driver" && u.driverProfile) {
      delete u.driverProfile;
      changed = true;
    } else if (u.role === "driver") {
      const dp = ensureDriverProfileShape(u.driverProfile);
      if (JSON.stringify(u.driverProfile) !== JSON.stringify(dp)) {
        u.driverProfile = dp;
        changed = true;
      }
    }
  } else {
    // keep a driverProfile object for everyone (consistent keys)
    const dp = ensureDriverProfileShape(u.driverProfile);
    if (JSON.stringify(u.driverProfile) !== JSON.stringify(dp)) {
      u.driverProfile = dp;
      changed = true;
    }
  }

  // vendorProfile normalization
  if (REMOVE_PROFILES_FOR_NON_ROLE) {
    if (u.role !== "vendor" && u.vendorProfile) {
      delete u.vendorProfile;
      changed = true;
    } else if (u.role === "vendor") {
      const vp = ensureVendorProfileShape(u.vendorProfile);
      if (JSON.stringify(u.vendorProfile) !== JSON.stringify(vp)) {
        u.vendorProfile = vp;
        changed = true;
      }
    }
  } else {
    const vp = ensureVendorProfileShape(u.vendorProfile);
    if (JSON.stringify(u.vendorProfile) !== JSON.stringify(vp)) {
      u.vendorProfile = vp;
      changed = true;
    }
  }

  // Extra: ensure contacts is an array
  if (!Array.isArray(u.contacts)) {
    u.contacts = [];
    changed = true;
  }

  return changed;
}

async function run() {
  const dryRun = process.argv.includes("--dry-run");
  console.log("Connecting to", MONGO);
  await mongoose.connect(MONGO, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log("Connected to MongoDB");

  const total = await User.countDocuments({});
  console.log(`Users to scan: ${total}`);

  let processed = 0;
  let modified = 0;
  let removedDriverLocation = 0;
  let vendorProfilesStripped = 0;
  let driverProfilesStripped = 0;
  let vendorProfilesUpdated = 0;
  let driverProfilesUpdated = 0;

  // Use async iterator (works reliably across Mongoose versions)
  const cursor = User.find({}).cursor();
  for await (const u of cursor) {
    processed++;
    // record presence of location before changes
    const hadDriverLocation = !!(u.driverProfile && u.driverProfile.location);
    const hadVendorProfile = !!u.vendorProfile;
    const hadDriverProfile = !!u.driverProfile;

    const changed = await normalizeUser(u, { dryRun });

    if (hadDriverLocation && !dryRun) removedDriverLocation++;

    // heuristics for counts
    if (changed) {
      modified++;
      // calculate whether profiles stripped or updated for reporting
      if (!dryRun) {
        try {
          await u.save({ validateBeforeSave: false });
        } catch (err) {
          console.error(
            "Failed to save user",
            u._id && u._id.toString(),
            err && err.message
          );
        }
      }
      // after save, attempt to count whether a profile was removed/added - not exact in dry run
      // We'll check by comparing shapes from before/after would be more involved; keep simple counters
    }

    if (processed % BATCH_SIZE === 0) {
      console.log(
        `Processed ${processed}/${total} users (modified ${modified})`
      );
    }
  }

  console.log("Migration complete");
  console.log(`Processed: ${processed}`);
  console.log(`Modified: ${modified}`);
  console.log(`Driver location fields removed: ${removedDriverLocation}`);
  console.log(`Dry run: ${dryRun}`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error("Migration failed", err);
  process.exit(1);
});

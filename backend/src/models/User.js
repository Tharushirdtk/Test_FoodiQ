const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const userSchema = new mongoose.Schema(
  {
    // User role
    role: {
      type: String,
      enum: ["customer", "driver", "support", "admin", "vendor"],
      default: "customer",
      required: true,
    },

    // Vendor-specific fields
    vendorProfile: {
      storeName: { type: String, default: null },
      // storeAddress: use a nested object so street/city/state/zip persist predictably
      storeAddress: {
        street: { type: String, default: null },
        city: { type: String, default: null },
        state: { type: String, default: null },
        zip: { type: String, default: null },
        country: { type: String, default: null },
      },
      storePhone: { type: String, default: null },
      description: { type: String, default: null },
      businessRegNumber: { type: String, default: null },
      approved: { type: Boolean, default: false },
    },

    // Driver-specific fields
    driverProfile: {
      vehicleType: { type: String, default: null },
      vehicleNumber: { type: String, default: null },
      vehicleImage: { type: String, default: null },
      licenseNumber: { type: String, default: null },
      rating: { type: Number, default: 5 },
      trips: { type: Number, default: 0 },
      active: { type: Boolean, default: false },
      // Note: driverProfile.location removed to prevent storing location on user creation
      assignedOrders: [{ type: mongoose.Schema.Types.ObjectId, ref: "Order" }],
    },
    name: {
      type: String,
      required: [true, "Please add a name"],
    },
    email: {
      type: String,
      required: [true, "Please add an email"],
      unique: true,
      lowercase: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        "Please add a valid email",
      ],
    },
    password: {
      type: String,
      required: [true, "Please add a password"],
      minlength: 8,
      match: [
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/,
        "Password must contain at least one uppercase letter, one lowercase letter, one number and one special character",
      ],
      select: false, // Don't return password in queries
    },
    displayName: {
      type: String,
      default: null,
    },
    birthdate: {
      type: Date,
      default: null,
    },
    gender: {
      type: String,
      enum: ["male", "female", "other", "prefer_not_to_say", null],
      default: null,
    },
    avatar: {
      type: String,
      default: null,
    },
    // Phone verification (primary contact)
    phone: {
      type: String,
      default: null,
    },
    phoneCountry: {
      type: String,
      default: null,
    },
    phoneVerified: {
      type: Boolean,
      default: false,
    },
    // Additional contacts (up to 5 total including primary)
    contacts: [
      {
        label: { type: String, default: "Mobile" },
        number: { type: String, required: true },
        country: { type: String, default: null },
        isPrimary: { type: Boolean, default: false },
        verified: { type: Boolean, default: false },
      },
    ],
    phoneVerificationCode: {
      type: String,
      select: false,
    },
    phoneVerificationExpiresAt: {
      type: Date,
    },
    pendingVerificationContactId: {
      type: String,
      select: false,
    },
    // Email verification
    emailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: {
      type: String,
      select: false,
    },
    emailVerificationExpiresAt: {
      type: Date,
    },
    // Password reset
    passwordResetToken: {
      type: String,
      select: false,
    },
    passwordResetExpiresAt: {
      type: Date,
    },
    // Registration progress
    registrationStep: {
      type: Number,
      default: 1,
    },
    // User preferences
    preferences: {
      darkMode: {
        type: Boolean,
        default: false,
      },
      pushNotifications: {
        type: Boolean,
        default: true,
      },
    },
    // Favorites
    favorites: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
    ],
    // Saved addresses
    addresses: [
      {
        label: { type: String, default: "Home" },
        street: String,
        city: String,
        state: String,
        postalCode: String,
        country: { type: String, default: "Sri Lanka" },
        isDefault: { type: Boolean, default: false },
      },
    ],
    // Payment methods
    paymentMethods: [
      {
        type: {
          type: String,
          enum: ["card", "paypal", "cash"],
          default: "card",
        },
        last4: String,
        brand: String,
        expiryMonth: Number,
        expiryYear: Number,
        isDefault: { type: Boolean, default: false },
      },
    ],
    // Notifications
    notifications: [
      {
        title: String,
        message: String,
        type: {
          type: String,
          enum: ["order", "promo", "system", "info"],
          default: "info",
        },
        read: { type: Boolean, default: false },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Encrypt password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    return next();
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Match user entered password to hashed password in database
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Generate email verification token
userSchema.methods.generateEmailVerificationToken = function () {
  const token = crypto.randomBytes(32).toString("hex");
  this.emailVerificationToken = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
  this.emailVerificationExpiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  return token;
};

// Generate password reset token
userSchema.methods.generatePasswordResetToken = function () {
  const token = crypto.randomBytes(32).toString("hex");
  this.passwordResetToken = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
  this.passwordResetExpiresAt = Date.now() + 60 * 60 * 1000; // 1 hour
  return token;
};

// Generate phone verification code
userSchema.methods.generatePhoneVerificationCode = function () {
  const code = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
  this.phoneVerificationCode = crypto
    .createHash("sha256")
    .update(code)
    .digest("hex");
  this.phoneVerificationExpiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes
  return code;
};

// Verify phone code
userSchema.methods.verifyPhoneCode = function (code) {
  const hashedCode = crypto.createHash("sha256").update(code).digest("hex");
  return (
    this.phoneVerificationCode === hashedCode &&
    this.phoneVerificationExpiresAt > Date.now()
  );
};

// Calculate age from birthdate using shared helper
const { getAgeFromDate } = require("../utils/age");
userSchema.methods.getAge = function () {
  return getAgeFromDate(this.birthdate);
};

module.exports = mongoose.model("User", userSchema);

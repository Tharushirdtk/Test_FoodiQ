const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/User");
const Address = require("../models/Address");
const {
  sendVerificationEmail,
  sendPasswordResetEmail,
} = require("../utils/mailer");
const { sendVerificationCode } = require("../utils/smsProvider");
const { getAgeFromDate } = require("../utils/age");
const { passwordSchema, registerStep1Schema } = require("../utils/validators");

// Generate JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "30d",
  });
};

// @desc    Register Step 1 - VALIDATION ONLY (no user creation)
// @route   POST /api/auth/register/step1
// @access  Public
const registerStep1 = async (req, res) => {
  try {
    const validated = req.validatedBody || req.body || {};
    const role = validated.role || "customer";

    // Driver age check
    if (role === "driver") {
      const age = getAgeFromDate(validated.birthdate);
      if (age === null) {
        return res.status(400).json({
          valid: false,
          errors: [{ field: "birthdate", message: "Birthdate is required" }],
        });
      }
      if (age < 18) {
        return res.status(400).json({
          valid: false,
          errors: [
            {
              field: "birthdate",
              message: "Driver must be at least 18 years old",
            },
          ],
        });
      }
    }

    return res.status(200).json({ valid: true, data: validated });
  } catch (error) {
    console.error("Register Step 1 error:", error);
    return res
      .status(500)
      .json({ message: "Server error validating registration data" });
  }
};

// @desc    Register Step 2 - Add contact and address info (Legacy - kept for compatibility)
// @route   POST /api/auth/register/step2
// @access  Public (with userId from step1)
const registerStep2 = async (req, res) => {
  try {
    const { userId, phone, phoneCountry, skipAddress, address } = req.body;
    if (!userId)
      return res.status(400).json({ message: "User ID is required" });

    const user = await User.findById(userId);
    if (!user)
      return res
        .status(404)
        .json({ message: "User not found. Please start registration again." });

    if (phone) {
      user.phone = phone;
      user.phoneCountry = phoneCountry || null;
      user.phoneVerified = false;
    }

    if (!skipAddress && address?.street) {
      await Address.create({
        user: user._id,
        type: address.type || "home",
        street: address.street,
        city: address.city,
        state: address.state,
        zip: address.zip,
        country: address.country || "Sri Lanka",
      });
    }

    user.registrationStep = 2;
    await user.save({ validateBeforeSave: false });

    res.status(200).json({
      message:
        "Registration complete! Please check your email to verify your account, then log in.",
      success: true,
    });
  } catch (error) {
    console.error("Register Step 2 error:", error);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
};

// @desc    Full Registration - Create account with all info in one call
// @route   POST /api/auth/register
// @access  Public
const registerFull = async (req, res) => {
  try {
    const body = req.body;

    // reuse Joi schema from validators (preferred)
    const { error: step1ValidationError, value: step1Validated } =
      registerStep1Schema.validate(body, {
        abortEarly: false,
        stripUnknown: true,
      });

    if (step1ValidationError) {
      const errors = step1ValidationError.details.map((d) => ({
        field: d.path.join("."),
        message: d.message,
      }));
      return res.status(400).json({ valid: false, errors });
    }

    // do driver-specific age check (same logic as registerStep1)
    if (step1Validated.role === "driver") {
      const age = getAgeFromDate(step1Validated.birthdate);
      if (age === null) {
        return res.status(400).json({
          valid: false,
          errors: [{ field: "birthdate", message: "Birthdate is required" }],
        });
      }
      if (age < 18) {
        return res.status(400).json({
          valid: false,
          errors: [
            {
              field: "birthdate",
              message: "Driver must be at least 18 years old",
            },
          ],
        });
      }
    }
    // then keep using `step1Validated` / `body` for the rest of registerFull

    // Required fields
    const {
      name,
      email,
      password,
      birthdate,
      gender,
      phone,
      phoneCountry,
      skipAddress,
      address,
      role,
      vendorProfile,
      driverProfile,
    } = body;

    // Only allowed roles (determine assignedRole early so we can use it below)
    const allowedRoles = ["customer", "vendor", "driver"];
    const assignedRole = allowedRoles.includes(role) ? role : "customer";

    // Require name, email and password for all roles. Birthdate is required only for drivers.
    if (!name || !email || !password || (assignedRole === "driver" && !birthdate)) {
      return res
        .status(400)
        .json({ message: "Please provide all required fields" });
    }

    // assignedRole already determined above

    // Validate password
    const { error } = passwordSchema.validate(password);
    if (error) {
      return res.status(400).json({
        message: "Password does not meet requirements",
        details: error.details.map((d) => d.message),
      });
    }

    // Prevent email enumeration
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(200).json({
        message:
          "If this email is not already registered, a verification email has been sent.",
        success: false,
      });
    }

    // Construct user
    const userData = {
      name,
      email: email.toLowerCase(),
      password,
      birthdate,
      gender: gender || null,
      phone: phone || null,
      phoneCountry: phoneCountry || null,
      phoneVerified: false,
      emailVerified: false,
      registrationStep: 2,
      role: assignedRole,
    };

    // Role-specific checks
    if (assignedRole === "vendor") {
      if (!vendorProfile?.storeName) {
        return res
          .status(400)
          .json({ message: "Vendor store name is required" });
      }
      // Store address is optional on the backend (frontend enforces it for vendors).
      // If provided, we will save it inside vendorProfile, but do not block registration
      // when it's missing to allow more flexible onboarding flows.
      // Require both contact numbers; verification is not required at registration
      if (!phone) {
        return res.status(400).json({
          message: "Owner contact number must be provided for vendor registration",
        });
      }
      if (!vendorProfile.storePhone) {
        return res.status(400).json({
          message: "Store contact number must be provided for vendor registration",
        });
      }

      userData.vendorProfile = {
        storeName: vendorProfile.storeName,
        // storeAddress is a structured object (kept within vendorProfile, not saved to addresses collection)
        storeAddress: vendorProfile.storeAddress,
        storePhone: vendorProfile.storePhone || null,
        approved: false,
      };
    }

    if (assignedRole === "driver") {
      if (
        !driverProfile?.licenseNumber &&
        !driverProfile?.vehicleNumber &&
        !driverProfile?.licensePlate
      ) {
        return res
          .status(400)
          .json({ message: "Driver license or vehicle number is required" });
      }
      const age = getAgeFromDate(birthdate);
      if (age < 18) {
        return res
          .status(400)
          .json({ message: "Driver must be at least 18 years old" });
      }
      if (!phone) {
        return res
          .status(400)
          .json({ message: "Phone must be provided for driver registration" });
      }
      userData.driverProfile = {
        vehicleType: driverProfile.vehicleType || null,
        vehicleNumber:
          driverProfile.vehicleNumber || driverProfile.licensePlate || null,
        licenseNumber: driverProfile.licenseNumber || null,
        active: false,
      };
    }

    // Create user
    // Ensure profiles are only present for their roles (defensive against crafted requests)
    if (assignedRole !== "vendor" && userData.vendorProfile)
      delete userData.vendorProfile;
    if (assignedRole !== "driver" && userData.driverProfile)
      delete userData.driverProfile;

    const user = await User.create(userData);

    // Address
    if (!skipAddress && address?.street) {
      await Address.create({
        user: user._id,
        type: address.type || "home",
        street: address.street,
        city: address.city,
        state: address.state,
        zip: address.zip,
        country: address.country || "Sri Lanka",
      });
    }

    // Send email verification
    const emailToken = user.generateEmailVerificationToken();
    await user.save({ validateBeforeSave: false });
    let emailSent = false;
    try {
      await sendVerificationEmail(user, emailToken);
      emailSent = true;
    } catch (err) {
      console.error("Failed to send verification email:", err);
    }

    res.status(201).json({
      message: emailSent
        ? "Registration complete! Please check your email to verify your account."
        : "Registration complete! Verification email could not be sent. Request a new one from login page.",
      success: true,
      emailSent,
    });
  } catch (error) {
    console.error("Register Full error:", error);
    if (error.code === 11000) {
      return res.status(200).json({
        message:
          "If this email is not already registered, a verification email has been sent.",
        success: false,
      });
    }
    res.status(500).json({ message: "Server error. Please try again later." });
  }
};

// @desc    Send phone verification code
// @route   POST /api/auth/send-phone-code or /api/auth/phone/send-otp
// @access  Public (with userId) or Private (with token)
const sendPhoneCode = async (req, res) => {
  try {
    const { userId, phone, phoneCountry } = req.body;

    // Get user from either userId param or authenticated user
    let user;
    if (req.user) {
      // Authenticated user
      user = await User.findById(req.user.id).select("+phoneVerificationCode");
    } else if (userId) {
      // Registration flow
      user = await User.findById(userId).select("+phoneVerificationCode");
    } else {
      return res
        .status(400)
        .json({ message: "User ID or authentication required" });
    }

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // If phone provided, update it; otherwise use existing
    const phoneToVerify = phone || user.phone;
    if (!phoneToVerify) {
      return res.status(400).json({ message: "Phone number is required" });
    }

    // Update phone number if provided
    if (phone) {
      user.phone = phone;
      user.phoneCountry = phoneCountry || user.phoneCountry || null;
      user.phoneVerified = false; // Reset verification for new number
    }

    // Generate code
    const code = user.generatePhoneVerificationCode();
    await user.save({ validateBeforeSave: false });

    // Send SMS
    const result = await sendVerificationCode(phoneToVerify, code);

    res.status(200).json({
      message: "Verification code sent to your phone",
      // In mock mode, return the code for testing
      ...(result.mock && result.code && { code: result.code }),
    });
  } catch (error) {
    console.error("Send phone code error:", error);
    res
      .status(500)
      .json({ message: error.message || "Failed to send verification code" });
  }
};

// @desc    Verify phone code
// @route   POST /api/auth/verify-phone or /api/auth/phone/verify-otp
// @access  Public (with userId) or Private (with token)
const verifyPhone = async (req, res) => {
  try {
    const { userId, code, otp, phone } = req.body;
    const verificationCode = code || otp; // Support both param names

    if (!verificationCode) {
      return res.status(400).json({ message: "Verification code is required" });
    }

    // Get user from either userId param or authenticated user
    let user;
    if (req.user) {
      user = await User.findById(req.user.id).select(
        "+phoneVerificationCode phoneVerificationExpiresAt phone"
      );
    } else if (userId) {
      user = await User.findById(userId).select(
        "+phoneVerificationCode phoneVerificationExpiresAt phone"
      );
    } else {
      return res
        .status(400)
        .json({ message: "User ID or authentication required" });
    }

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Use phone from request if user doesn't have one stored (edge case)
    const phoneToVerify = user.phone || phone;
    if (!phoneToVerify) {
      return res.status(400).json({ message: "No phone number to verify" });
    }

    // If user doesn't have phone but we have it from request, update it
    if (!user.phone && phone) {
      user.phone = phone;
    }

    // Verify the code
    if (!user.verifyPhoneCode(verificationCode)) {
      return res
        .status(400)
        .json({ message: "Invalid or expired verification code" });
    }

    // Mark as verified and clear code
    user.phoneVerified = true;
    user.phoneVerificationCode = undefined;
    user.phoneVerificationExpiresAt = undefined;
    await user.save({ validateBeforeSave: false });

    res.status(200).json({
      message: "Phone number verified successfully",
      phoneVerified: true,
    });
  } catch (error) {
    console.error("Verify phone error:", error);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
};

// @desc    Verify email token
// @route   GET /api/auth/verify-email
// @access  Public
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res
        .status(400)
        .json({ message: "Verification token is required" });
    }

    // Hash the token to compare with DB
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      emailVerificationToken: hashedToken,
      emailVerificationExpiresAt: { $gt: Date.now() },
    });

    if (!user) {
      return res
        .status(400)
        .json({ message: "Invalid or expired verification link" });
    }

    // Mark email as verified
    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpiresAt = undefined;
    await user.save({ validateBeforeSave: false });

    res.status(200).json({
      message: "Email verified successfully! You can now log in.",
      emailVerified: true,
    });
  } catch (error) {
    console.error("Verify email error:", error);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
};

// @desc    Resend verification email
// @route   POST /api/auth/resend-email
// @access  Public
const resendVerificationEmail = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    // Always return success to prevent enumeration
    const successMessage =
      "If an account exists with this email, a verification link has been sent.";

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(200).json({ message: successMessage });
    }

    if (user.emailVerified) {
      return res
        .status(200)
        .json({ message: "Email is already verified. You can log in." });
    }

    // Generate new token
    const emailToken = user.generateEmailVerificationToken();
    await user.save({ validateBeforeSave: false });

    try {
      await sendVerificationEmail(user, emailToken);
    } catch (emailError) {
      console.error("Failed to send verification email:", emailError);
    }

    res.status(200).json({ message: successMessage });
  } catch (error) {
    console.error("Resend email error:", error);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
};

// @desc    Forgot password - request reset
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.validatedBody || req.body;

    // Always return success to prevent enumeration
    const successMessage =
      "If an account exists with this email, a password reset link has been sent.";

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(200).json({ message: successMessage });
    }

    // Generate reset token
    const resetToken = user.generatePasswordResetToken();
    await user.save({ validateBeforeSave: false });

    try {
      await sendPasswordResetEmail(user, resetToken);
    } catch (emailError) {
      console.error("Failed to send password reset email:", emailError);
      user.passwordResetToken = undefined;
      user.passwordResetExpiresAt = undefined;
      await user.save({ validateBeforeSave: false });
      return res
        .status(500)
        .json({ message: "Failed to send email. Please try again." });
    }

    res.status(200).json({ message: successMessage });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
};

// @desc    Reset password
// @route   POST /api/auth/reset-password
// @access  Public
const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.validatedBody || req.body;

    if (!token || !password) {
      return res
        .status(400)
        .json({ message: "Token and new password are required" });
    }

    // Extra guard: validate password with shared schema (middleware should already do this, but keep safe)
    try {
      const { error } = passwordSchema.validate(password);
      if (error)
        return res.status(400).json({
          message: "Password does not meet requirements",
          details: error.details.map((d) => d.message),
        });
    } catch (e) {
      // ignore validator load errors and continue
    }

    // Hash the token to compare with DB
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpiresAt: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        message: "Invalid or expired reset link. Please request a new one.",
      });
    }

    // Update password
    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpiresAt = undefined;
    await user.save();

    res.status(200).json({
      message:
        "Password updated successfully! You can now log in with your new password.",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
};

// @desc    Authenticate a user (login)
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    const { email, password } = req.validatedBody || req.body;

    // Validation
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Please provide email and password" });
    }

    // Check for user - use generic message to prevent enumeration
    const user = await User.findOne({ email: email.toLowerCase() }).select(
      "+password"
    );

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Check if email is verified
    if (!user.emailVerified) {
      return res.status(403).json({
        message:
          "Please verify your email before logging in. Check your inbox or spam folder.",
        emailNotVerified: true,
        email: user.email,
      });
    }

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      displayName: user.displayName,
      phone: user.phone,
      phoneVerified: user.phoneVerified,
      emailVerified: user.emailVerified,
      birthdate: user.birthdate,
      gender: user.gender,
      token: generateToken(user._id),
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    // Get user's addresses
    const addresses = await Address.find({ user: req.user.id });

    // Prepare safe driverProfile: hide bcrypt-like hashes
    const safeDriverProfile = user.driverProfile
      ? (() => {
          const isHashed = (typeof user.driverProfile.vehicleNumber === 'string' && user.driverProfile.vehicleNumber.startsWith('$2'));
          return {
            vehicleType: user.driverProfile.vehicleType || null,
            // Do not expose bcrypt hashes; provide null but indicate presence
            vehicleNumber: isHashed ? null : (user.driverProfile.vehicleNumber || null),
            vehicleNumberIsHashed: isHashed,
            vehicleImage: user.driverProfile.vehicleImage || null,
            licenseNumber: user.driverProfile.licenseNumber || null,
            rating: typeof user.driverProfile.rating !== 'undefined' ? user.driverProfile.rating : 5,
            active: typeof user.driverProfile.active !== 'undefined' ? user.driverProfile.active : false,
            assignedOrders: Array.isArray(user.driverProfile.assignedOrders) ? user.driverProfile.assignedOrders : [],
          };
        })()
      : null;

    // Ensure vendorProfile shape is predictable
    const safeVendorProfile = user.vendorProfile
      ? {
          storeName: user.vendorProfile.storeName || null,
          storePhone: user.vendorProfile.storePhone || null,
          businessRegNumber: user.vendorProfile.businessRegNumber || null,
          description: user.vendorProfile.description || null,
          approved: typeof user.vendorProfile.approved !== 'undefined' ? user.vendorProfile.approved : false,
          storeAddress: user.vendorProfile.storeAddress || null,
        }
      : null;

    res.status(200).json({
      _id: user._id,
      role: user.role,
      name: user.name,
      email: user.email,
      displayName: user.displayName,
      phone: user.phone,
      phoneCountry: user.phoneCountry,
      phoneVerified: user.phoneVerified,
      emailVerified: user.emailVerified,
      birthdate: user.birthdate,
      gender: user.gender,
      avatar: user.avatar,
      preferences: user.preferences || {},
      vendorProfile: safeVendorProfile,
      driverProfile: safeDriverProfile,
      addresses,
      age: user.getAge(),
    });
  } catch (error) {
    console.error("Get me error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// @desc    Resend phone verification code (for logged in users)
// @route   POST /api/auth/resend-phone-code
// @access  Private
const resendPhoneCode = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "+phoneVerificationCode"
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.phone) {
      return res.status(400).json({
        message: "No phone number on file. Please add a phone number first.",
      });
    }

    if (user.phoneVerified) {
      return res
        .status(400)
        .json({ message: "Phone number is already verified" });
    }

    // Generate new code
    const code = user.generatePhoneVerificationCode();
    await user.save({ validateBeforeSave: false });

    // Send SMS
    const result = await sendVerificationCode(user.phone, code);

    res.status(200).json({
      message: "Verification code sent to your phone",
      ...(result.mock && result.code && { code: result.code }),
    });
  } catch (error) {
    console.error("Resend phone code error:", error);
    res
      .status(500)
      .json({ message: error.message || "Failed to send verification code" });
  }
};

// @desc    Verify phone code (for logged in users)
// @route   POST /api/auth/verify-phone-authenticated
// @access  Private
const verifyPhoneAuthenticated = async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ message: "Verification code is required" });
    }

    const user = await User.findById(req.user.id).select(
      "+phoneVerificationCode phoneVerificationExpiresAt"
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.phone) {
      return res.status(400).json({ message: "No phone number to verify" });
    }

    if (user.phoneVerified) {
      return res
        .status(400)
        .json({ message: "Phone number is already verified" });
    }

    // Verify the code
    if (!user.verifyPhoneCode(code)) {
      return res
        .status(400)
        .json({ message: "Invalid or expired verification code" });
    }

    // Mark as verified
    user.phoneVerified = true;
    user.phoneVerificationCode = undefined;
    user.phoneVerificationExpiresAt = undefined;
    await user.save({ validateBeforeSave: false });

    res.status(200).json({
      message: "Phone number verified successfully",
      phoneVerified: true,
    });
  } catch (error) {
    console.error("Verify phone authenticated error:", error);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
};

// @desc    Update phone number (for logged in users)
// @route   PUT /api/auth/phone
// @access  Private
const updatePhone = async (req, res) => {
  try {
    const { phone, phoneCountry } = req.body;

    if (!phone) {
      return res.status(400).json({ message: "Phone number is required" });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Update phone - reset verification status
    user.phone = phone;
    user.phoneCountry = phoneCountry || null;
    user.phoneVerified = false;
    user.phoneVerificationCode = undefined;
    user.phoneVerificationExpiresAt = undefined;

    // Generate and send verification code
    const code = user.generatePhoneVerificationCode();
    await user.save({ validateBeforeSave: false });

    // Send SMS
    const result = await sendVerificationCode(phone, code);

    res.status(200).json({
      message: "Phone number updated. Verification code sent.",
      phone: user.phone,
      phoneVerified: false,
      ...(result.mock && result.code && { code: result.code }),
    });
  } catch (error) {
    console.error("Update phone error:", error);
    res
      .status(500)
      .json({ message: error.message || "Failed to update phone number" });
  }
};

// @desc    Validate Register Step 1 data without creating a user
// @route   POST /api/auth/register/validate-step1
// @access  Public
const validateRegisterStep1 = async (req, res) => {
  try {
    // `validate` middleware already ran and populated req.validatedBody when used on route.
    const validated = req.validatedBody || req.body || {};

    // Role-aware additional checks (Joi handles most rules via registerStep1Schema)
    const role = validated.role || "customer";

    // Check existing email - prevent proceeding if email already registered
    if (validated.email) {
      try {
        const existing = await User.findOne({ email: validated.email.toLowerCase() });
        if (existing) {
          return res.status(400).json({
            valid: false,
            errors: [{ field: "email", message: "Email is already in use" }],
          });
        }
      } catch (e) {
        // On DB error, log and continue to allow other validation to run; this avoids blocking registration due to transient DB issues
        console.error("Error checking existing email in validateRegisterStep1:", e);
      }
    }

    // Driver-specific age check: must be at least 18
    if (role === "driver") {
      const birthdate = validated.birthdate || null;
      const age = getAgeFromDate(birthdate);
      if (age === null) {
        return res.status(400).json({
          valid: false,
          errors: [{ field: "birthdate", message: "Birthdate is required" }],
        });
      }
      if (age < 18) {
        return res.status(400).json({
          valid: false,
          errors: [
            {
              field: "birthdate",
              message: "Driver must be at least 18 years old",
            },
          ],
        });
      }
    }

    // All checks passed
    return res.status(200).json({ valid: true, data: validated });
  } catch (error) {
    console.error("Validate Register Step1 error:", error);
    return res
      .status(500)
      .json({ message: "Server error validating registration data" });
  }
};

module.exports = {
  registerStep1,
  validateRegisterStep1,
  registerStep2,
  registerFull,
  sendPhoneCode,
  verifyPhone,
  verifyEmail,
  resendVerificationEmail,
  forgotPassword,
  resetPassword,
  login,
  getMe,
  resendPhoneCode,
  verifyPhoneAuthenticated,
  updatePhone,
};

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const {
  register,
  registerStep1,
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
} = require('../controllers/authController');
const { protect, optionalAuth } = require('../middleware/auth');
const { 
  validate, 
  registerStep1Schema, 
  registerStep2Schema, 
  loginSchema, 
  forgotPasswordSchema, 
  resetPasswordSchema, 
  verifyPhoneSchema, 
  sendPhoneCodeSchema 
} = require('../utils/validators');

// Rate limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per window
  message: { message: 'Too many attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const emailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 requests per hour
  message: { message: 'Too many email requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const smsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 SMS per 15 minutes
  message: { message: 'Too many SMS requests. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public routes
router.post('/register', authLimiter, registerFull);
router.post('/register/step1', authLimiter, validate(registerStep1Schema), registerStep1);
router.post('/register/step2', authLimiter, validate(registerStep2Schema), registerStep2);
router.post('/login', authLimiter, validate(loginSchema), login);

// Email verification
router.get('/verify-email', verifyEmail);
router.post('/resend-email', emailLimiter, resendVerificationEmail);

// Password reset
router.post('/forgot-password', emailLimiter, validate(forgotPasswordSchema), forgotPassword);
router.post('/reset-password', authLimiter, validate(resetPasswordSchema), resetPassword);

// Phone verification (public - during registration)
router.post('/send-phone-code', smsLimiter, validate(sendPhoneCodeSchema), sendPhoneCode);
router.post('/verify-phone', authLimiter, validate(verifyPhoneSchema), verifyPhone);

// Phone verification (alternative endpoints for modal - supports both auth token and userId)
router.post('/phone/send-otp', optionalAuth, smsLimiter, sendPhoneCode);
router.post('/phone/verify-otp', optionalAuth, authLimiter, verifyPhone);

// Protected routes
router.get('/me', protect, getMe);
router.post('/resend-phone-code', protect, smsLimiter, resendPhoneCode);
router.post('/verify-phone-authenticated', protect, validate(verifyPhoneSchema), verifyPhoneAuthenticated);
router.put('/phone', protect, smsLimiter, updatePhone);

module.exports = router;
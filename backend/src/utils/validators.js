const Joi = require('joi');

// Password validation: min 8 chars, at least one uppercase, one lowercase, one digit and one special character
const passwordSchema = Joi.string()
  .min(8)
  .max(128)
  .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/)
  .required()
  .messages({
    'string.min': 'Password must be at least 8 characters',
    'string.max': 'Password must not exceed 128 characters',
    'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number and one special character',
    'any.required': 'Password is required',
  });

// Registration Step 1 validation
// Make birthdate optional for vendors and adjust messages for vendor name/email
const registerStep1Schema = Joi.object({
  // Only allow customer, vendor, driver from public Step 1
  role: Joi.string().valid('customer', 'driver', 'vendor').default('customer'),
  name: Joi.alternatives()
    .conditional('role', {
      is: 'vendor',
      then: Joi.string().min(2).max(100).required().messages({
        'string.min': 'Vendor full name must be at least 2 characters',
        'string.max': 'Vendor full name must not exceed 100 characters',
        'any.required': 'Vendor full name is required',
      }),
      otherwise: Joi.string().min(2).max(100).required().messages({
        'string.min': 'Name must be at least 2 characters',
        'string.max': 'Name must not exceed 100 characters',
        'any.required': 'Name is required',
      }),
    }),
  email: Joi.alternatives()
    .conditional('role', {
      is: 'vendor',
      then: Joi.string().email().required().messages({
        'string.email': 'Please provide a valid vendor email address',
        'any.required': 'Vendor email address is required',
      }),
      otherwise: Joi.string().email().required().messages({
        'string.email': 'Please provide a valid email address',
        'any.required': 'Email is required',
      }),
    }),
  password: passwordSchema,
  birthdate: Joi.alternatives()
    .conditional('role', {
      is: 'vendor',
      then: Joi.date().max('now').allow(null).optional().messages({
        'date.max': 'Birthdate cannot be in the future',
      }),
      otherwise: Joi.date().max('now').required().messages({
        'date.max': 'Birthdate cannot be in the future',
        'any.required': 'Birthdate is required',
      }),
    }),
  gender: Joi.alternatives()
    .conditional('role', {
      is: 'vendor',
      then: Joi.any().allow(null, '').optional(),
      otherwise: Joi.string().valid('male', 'female', 'other', 'prefer_not_to_say').allow(null, '').optional(),
    }),
});

// Registration Step 2 validation
const registerStep2Schema = Joi.object({
  userId: Joi.string().required().messages({
    'any.required': 'User ID is required',
  }),
  phone: Joi.string().pattern(/^\+[1-9]\d{1,14}$/).allow(null, '').optional().messages({
    'string.pattern.base': 'Please provide a valid phone number in international format',
  }),
  phoneCountry: Joi.string().length(2).allow(null, '').optional(),
  skipAddress: Joi.boolean().optional(),
  address: Joi.object({
    type: Joi.string().valid('home', 'work', 'other').default('home'),
    // Make address fields optional on the backend; frontend enforces required fields per-role.
    street: Joi.string().max(200).allow('', null).optional(),
    city: Joi.string().max(100).allow('', null).optional(),
    state: Joi.string().max(100).allow('', null).optional(),
    zip: Joi.string().max(20).allow('', null).optional(),
    country: Joi.string().max(100).default('Sri Lanka'),
  }).allow(null).optional(),
});

// Login validation
const loginSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required',
  }),
  password: Joi.string().required().messages({
    'any.required': 'Password is required',
  }),
});

// Forgot password validation
const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required',
  }),
});

// Reset password validation
const resetPasswordSchema = Joi.object({
  token: Joi.string().required().messages({
    'any.required': 'Reset token is required',
  }),
  password: passwordSchema,
});

// Send phone code validation
const sendPhoneCodeSchema = Joi.object({
  userId: Joi.string().required().messages({
    'any.required': 'User ID is required',
  }),
  phone: Joi.string().pattern(/^\+[1-9]\d{1,14}$/).required().messages({
    'string.pattern.base': 'Please provide a valid phone number in international format',
    'any.required': 'Phone number is required',
  }),
  phoneCountry: Joi.string().length(2).allow(null, '').optional(),
});

// Verify phone code validation (public - during registration)
const verifyPhoneSchema = Joi.object({
  userId: Joi.string().optional(),
  code: Joi.string().length(6).pattern(/^\d+$/).required().messages({
    'string.length': 'Verification code must be 6 digits',
    'string.pattern.base': 'Verification code must contain only numbers',
    'any.required': 'Verification code is required',
  }),
});

// Validation middleware factory
const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));
      return res.status(400).json({
        valid: false,
        errors,
      });
    }

    req.validatedBody = value;
    next();
  };
};

module.exports = {
  validate,
  registerStep1Schema,
  registerStep2Schema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyPhoneSchema,
  sendPhoneCodeSchema,
  passwordSchema,
};

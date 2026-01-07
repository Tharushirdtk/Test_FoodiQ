const Joi = require('joi');

// Password validation: min 8 chars, at least one letter, one digit and one special character
const passwordSchema = Joi.string()
  .min(8)
  .max(128)
  .pattern(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9])/)
  .required()
  .messages({
    'string.min': 'Password must be at least 8 characters',
    'string.max': 'Password must not exceed 128 characters',
    'string.pattern.base': 'Password must contain at least one letter, one number and one special character',
    'any.required': 'Password is required',
  });

// Registration Step 1 validation
const registerStep1Schema = Joi.object({
  name: Joi.string().min(2).max(100).required().messages({
    'string.min': 'Name must be at least 2 characters',
    'string.max': 'Name must not exceed 100 characters',
    'any.required': 'Name is required',
  }),
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required',
  }),
  password: passwordSchema,
  birthdate: Joi.date().max('now').required().messages({
    'date.max': 'Birthdate cannot be in the future',
    'any.required': 'Birthdate is required',
  }),
  gender: Joi.string().valid('male', 'female', 'other', 'prefer_not_to_say').allow(null, '').optional(),
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
    street: Joi.string().max(200).required(),
    city: Joi.string().max(100).required(),
    state: Joi.string().max(100).allow('').optional(),
    zip: Joi.string().max(20).required(),
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
        message: 'Validation failed',
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
};

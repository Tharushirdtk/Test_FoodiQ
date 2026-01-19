const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  try {
    // Allow token from multiple sources to improve compatibility across clients:
    // 1) Authorization: Bearer <token>
    // 2) x-access-token header
    // 3) cookie: req.cookies.token (if cookie-parser is used)
    // 4) query param: ?token=<token>
    let token = null;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    if (!token && req.headers['x-access-token']) token = req.headers['x-access-token'];
    if (!token && req.cookies && req.cookies.token) token = req.cookies.token;
    if (!token && req.query && req.query.token) token = req.query.token;

    if (!token) return res.status(401).json({ message: 'Not authorized, no token' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password');
    return next();
  } catch (error) {
    console.error(error);
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

// Optional auth - sets req.user if valid token exists, but doesn't fail if not
const optionalAuth = async (req, res, next) => {
  try {
    let token = null;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) token = req.headers.authorization.split(' ')[1];
    if (!token && req.headers['x-access-token']) token = req.headers['x-access-token'];
    if (!token && req.cookies && req.cookies.token) token = req.cookies.token;
    if (!token && req.query && req.query.token) token = req.query.token;
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = await User.findById(decoded.id).select('-password');
      } catch (e) {
        req.user = null;
      }
    }
  } catch (e) {
    req.user = null;
  }
  next();
};

// Role-based access control middleware
const requireRole = (roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Not authorized' });
  const allowed = Array.isArray(roles) ? roles : [roles];
  if (!allowed.includes(req.user.role)) {
    return res.status(403).json({ message: 'Forbidden: insufficient role' });
  }
  next();
};

module.exports = { protect, optionalAuth, requireRole };
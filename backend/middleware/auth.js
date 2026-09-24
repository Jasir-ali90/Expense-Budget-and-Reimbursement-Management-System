const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ROLES } = require('../config/constants');

/**
 * Extract a bearer token from the Authorization header.
 */
const extractToken = (req) => {
  const header = req.headers.authorization || req.headers.Authorization;
  if (header && typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim();
  }
  return null;
};

/**
 * Verify the JWT, load the account and make sure it is still usable.
 * Deactivated accounts are rejected immediately (rule: an admin can
 * activate/deactivate user accounts).
 */
const protect = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  if (!token) {
    throw ApiError.unauthorized('Authentication token is missing');
  }

  let decoded;
  try {
    decoded = jwt.verify(token, env.jwtSecret);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('Your session has expired. Please sign in again.');
    }
    throw ApiError.unauthorized('Invalid authentication token');
  }

  const user = await User.findById(decoded.id).select('+passwordChangedAt');
  if (!user) {
    throw ApiError.unauthorized('The account linked to this token no longer exists');
  }
  if (!user.isActive) {
    throw ApiError.forbidden(
      'Your account has been deactivated. Please contact an administrator.',
    );
  }

  // A password change invalidates tokens that were issued earlier.
  if (
    user.passwordChangedAt &&
    decoded.iat &&
    user.passwordChangedAt.getTime() > decoded.iat * 1000
  ) {
    throw ApiError.unauthorized('Password recently changed. Please sign in again.');
  }

  req.user = user;
  req.token = token;
  return next();
});

/**
 * Role based access control.
 * Usage: router.post('/', protect, authorize(ROLES.ADMIN), handler)
 */
const authorize = (...roles) => (req, res, next) => {
  if (!req.user) {
    return next(ApiError.unauthorized('Authentication is required'));
  }
  if (!roles.includes(req.user.role)) {
    return next(
      ApiError.forbidden(`Role "${req.user.role}" is not allowed to perform this action`),
    );
  }
  return next();
};

const isAdmin = authorize(ROLES.ADMIN);
const isFinanceOrAdmin = authorize(ROLES.ADMIN, ROLES.FINANCE_MANAGER);

/**
 * Sign a JWT for a user document.
 */
const signToken = (user) =>
  jwt.sign({ id: user._id.toString(), role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });

const signTokenWithExpiry = (user) => {
  const token = signToken(user);
  const decoded = jwt.decode(token);
  return { token, expiresAt: decoded?.exp ? new Date(decoded.exp * 1000) : null };
};

module.exports = {
  protect,
  authorize,
  isAdmin,
  isFinanceOrAdmin,
  signToken,
  signTokenWithExpiry,
  extractToken,
};

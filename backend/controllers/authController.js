const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendOk, sendMessage } = require('../utils/apiResponse');
const { requireEmail, requirePassword, requireString } = require('../utils/validate');
const { signTokenWithExpiry } = require('../middleware/auth');
const auditService = require('../services/auditService');
const { AUDIT_ACTIONS, ENTITY_TYPES } = require('../config/constants');

/**
 * Authentication controller.
 * Stateless JWT: the client stores the token and drops it on logout.
 * Passwords are hashed by the User model pre-save hook.
 */

/**
 * @route POST /api/auth/login
 * @access public
 */
const login = asyncHandler(async (req, res) => {
  const email = requireEmail(req.body);
  const password = requirePassword(req.body);

  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.matchPassword(password))) {
    throw ApiError.unauthorized('Invalid email or password');
  }
  if (!user.isActive) {
    throw ApiError.forbidden(
      'Your account has been deactivated. Please contact an administrator.',
    );
  }

  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  const { token, expiresAt } = signTokenWithExpiry(user);

  await auditService.recordFromRequest(req, {
    entityType: ENTITY_TYPES.USER,
    entityId: user._id,
    entityLabel: user.email,
    action: AUDIT_ACTIONS.UPDATE,
    description: 'User signed in',
  });

  sendOk(
    res,
    {
      token,
      expiresAt,
      user: user.toPublicJSON(),
    },
    'Signed in successfully',
  );
});

/**
 * @route GET /api/auth/me
 * @access protected
 */
const getMe = asyncHandler(async (req, res) => {
  sendOk(res, { user: req.user.toPublicJSON() });
});

/**
 * @route POST /api/auth/logout
 * @access protected
 * Stateless - the client removes its token; the endpoint just acknowledges.
 */
const logout = asyncHandler(async (req, res) => {
  sendMessage(res, 'Signed out successfully');
});

/**
 * @route POST /api/auth/change-password
 * @access protected
 */
const changePassword = asyncHandler(async (req, res) => {
  const currentPassword = requireString(req.body, 'currentPassword', { label: 'Current password' });
  const newPassword = requirePassword(req.body, 'newPassword');
  if (newPassword === currentPassword) {
    throw ApiError.badRequest('The new password must be different from the current password');
  }

  const user = await User.findById(req.user._id).select('+password');
  if (!user || !(await user.matchPassword(currentPassword))) {
    throw ApiError.unauthorized('The current password is incorrect');
  }

  user.password = newPassword;
  user.mustChangePassword = false;
  await user.save(); // pre-save hook hashes and bumps passwordChangedAt

  await auditService.recordFromRequest(req, {
    entityType: ENTITY_TYPES.USER,
    entityId: user._id,
    entityLabel: user.email,
    action: AUDIT_ACTIONS.CHANGE_PASSWORD,
    description: 'Password changed',
  });

  sendMessage(
    res,
    'Password changed successfully. Please sign in again with your new password.',
  );
});

module.exports = {
  login,
  getMe,
  logout,
  changePassword,
};

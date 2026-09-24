const mongoose = require('mongoose');
const User = require('../models/User');
const Department = require('../models/Department');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendOk, sendCreated, sendPaginated } = require('../utils/apiResponse');
const { buildListQuery } = require('../utils/queryBuilder');
const {
  requireEmail,
  requireString,
  optionalString,
  requireEnum,
  optionalObjectId,
  requirePassword,
} = require('../utils/validate');
const auditService = require('../services/auditService');
const notificationService = require('../services/notificationService');
const { toStoredFile, removeUploadedFile } = require('../middleware/upload');
const { ROLES, ROLE_VALUES, AUDIT_ACTIONS, ENTITY_TYPES, NOTIFICATION_TYPES } = require('../config/constants');

/**
 * User management controller (Admin).
 * Every mutation is audited; activation changes also notify the user.
 */

/** Guards: an admin cannot demote or deactivate the last active admin. */
const countActiveAdmins = async (excludeUserId = null) => {
  const filter = { role: ROLES.ADMIN, isActive: true };
  if (excludeUserId) filter._id = { $ne: excludeUserId };
  return User.countDocuments(filter);
};

const ensureNotLastAdmin = async (userId, message) => {
  const remaining = await countActiveAdmins(userId);
  if (remaining === 0) throw ApiError.badRequest(message);
};

/**
 * @route GET /api/users
 * @query search, role, department, isActive, page, limit, sort
 * @access Admin, Finance Manager (read only)
 */
const listUsers = asyncHandler(async (req, res) => {
  const { filter, sort, skip, limit, page } = buildListQuery(req.query, {
    searchFields: ['name', 'email', 'employeeCode', 'designation'],
    filters: [
      { field: 'role', type: 'string' },
      { field: 'department', type: 'objectId' },
      { field: 'isActive', type: 'boolean' },
    ],
    sortableFields: ['name', 'email', 'createdAt', 'role'],
    defaultSort: { createdAt: -1 },
  });

  const [users, total] = await Promise.all([
    User.find(filter).sort(sort).skip(skip).limit(limit).populate('department', 'name code'),
    User.countDocuments(filter),
  ]);

  sendPaginated(
    res,
    users.map((user) => user.toPublicJSON()),
    { page, limit, total },
  );
});

/**
 * @route GET /api/users/:id
 * @access Admin, Finance Manager
 */
const getUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('Invalid user id');

  const user = await User.findById(id).populate('department', 'name code');
  if (!user) throw ApiError.notFound('User not found');

  sendOk(res, { user: user.toPublicJSON() });
});

/**
 * @route POST /api/users
 * @access Admin
 */
const createUser = asyncHandler(async (req, res) => {
  const name = requireString(req.body, 'name', { max: 120, label: 'Name' });
  const email = requireEmail(req.body);
  const password = requirePassword(req.body);
  const role = requireEnum(req.body, 'role', ROLE_VALUES, { label: 'Role' });
  const department = optionalObjectId(req.body, 'department');
  const employeeCode = optionalString(req.body, 'employeeCode', { max: 40 });
  const designation = optionalString(req.body, 'designation', { max: 120 });
  const phone = optionalString(req.body, 'phone', { max: 30 });

  const existing = await User.findOne({ email });
  if (existing) throw ApiError.conflict('A user with this email already exists');

  if (department) {
    const dept = await Department.findById(department);
    if (!dept || dept.isArchived) {
      throw ApiError.badRequest('Department does not exist or is archived');
    }
  }
  if (role !== ROLES.EMPLOYEE && department) {
    throw ApiError.badRequest('Only employees are assigned to a department');
  }

  const user = await User.create({
    name,
    email,
    password,
    role,
    department: department || null,
    employeeCode: employeeCode || null,
    designation,
    phone,
    createdBy: req.user._id,
  });

  await auditService.recordFromRequest(req, {
    entityType: ENTITY_TYPES.USER,
    entityId: user._id,
    entityLabel: user.email,
    action: AUDIT_ACTIONS.CREATE,
    description: `User created with role ${role}`,
    after: { name, email, role },
  });

  sendCreated(res, { user: user.toPublicJSON() }, 'User created successfully');
});

/**
 * @route PUT /api/users/:id
 * @access Admin
 */
const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('Invalid user id');

  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User not found');

  const before = { role: user.role, department: String(user.department || '') };
  const name = optionalString(req.body, 'name', { max: 120 });
  const role = req.body.role !== undefined ? requireEnum(req.body, 'role', ROLE_VALUES, { label: 'Role' }) : undefined;
  const department = req.body.department !== undefined ? optionalObjectId(req.body, 'department') : undefined;
  const employeeCode = req.body.employeeCode !== undefined ? optionalString(req.body, 'employeeCode', { max: 40 }) : undefined;
  const designation = req.body.designation !== undefined ? optionalString(req.body, 'designation', { max: 120 }) : undefined;
  const phone = req.body.phone !== undefined ? optionalString(req.body, 'phone', { max: 30 }) : undefined;

  if (role && role !== user.role) {
    if (user.role === ROLES.ADMIN && role !== ROLES.ADMIN) {
      await ensureNotLastAdmin(user._id, 'Cannot demote the last active administrator');
    }
    user.role = role;
  }

  if (department !== undefined) {
    if (department) {
      const dept = await Department.findById(department);
      if (!dept || dept.isArchived) {
        throw ApiError.badRequest('Department does not exist or is archived');
      }
    }
    const effectiveRole = role || user.role;
    if (department && effectiveRole !== ROLES.EMPLOYEE) {
      throw ApiError.badRequest('Only employees are assigned to a department');
    }
    user.department = department || null;
  }

  if (name !== undefined) user.name = name;
  if (employeeCode !== undefined) user.employeeCode = employeeCode || null;
  if (designation !== undefined) user.designation = designation;
  if (phone !== undefined) user.phone = phone;

  await user.save();

  await auditService.recordFromRequest(req, {
    entityType: ENTITY_TYPES.USER,
    entityId: user._id,
    entityLabel: user.email,
    action: AUDIT_ACTIONS.UPDATE,
    description: 'User profile updated',
    before,
    after: { role: user.role, department: String(user.department || '') },
  });

  sendOk(res, { user: user.toPublicJSON() }, 'User updated successfully');
});

/**
 * @route PATCH /api/users/:id/status
 * @body { isActive: boolean, reason?: string }
 * @access Admin
 */
const setUserStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('Invalid user id');

  const isActive = req.body.isActive;
  if (typeof isActive !== 'boolean') {
    throw ApiError.badRequest('isActive must be true or false');
  }
  const reason = optionalString(req.body, 'reason', { max: 300 });
  if (!isActive && !reason) {
    throw ApiError.badRequest('A reason is required when deactivating an account');
  }

  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User not found');

  if (user._id.equals(req.user._id) && !isActive) {
    throw ApiError.badRequest('You cannot deactivate your own account');
  }
  if (user.isActive && !isActive) {
    await ensureNotLastAdmin(user._id, 'Cannot deactivate the last active administrator');
  }
  if (user.isActive === isActive) {
    throw ApiError.badRequest(`The account is already ${isActive ? 'active' : 'deactivated'}`);
  }

  user.isActive = isActive;
  user.deactivatedAt = isActive ? null : new Date();
  user.deactivationReason = isActive ? null : reason;
  await user.save();

  await auditService.recordFromRequest(req, {
    entityType: ENTITY_TYPES.USER,
    entityId: user._id,
    entityLabel: user.email,
    action: isActive ? AUDIT_ACTIONS.ACTIVATE : AUDIT_ACTIONS.DEACTIVATE,
    description: isActive ? 'Account activated' : 'Account deactivated',
    reason,
    before: { isActive: !isActive },
    after: { isActive },
  });

  await notificationService.createNotification({
    user: user._id,
    type: isActive ? NOTIFICATION_TYPES.ACCOUNT_ACTIVATED : NOTIFICATION_TYPES.ACCOUNT_DEACTIVATED,
    title: isActive ? 'Account activated' : 'Account deactivated',
    message: isActive
      ? 'Your account has been activated. Welcome back!'
      : `Your account has been deactivated. Reason: ${reason}`,
    entityType: ENTITY_TYPES.USER,
    entityId: user._id,
  });

  sendOk(res, { user: user.toPublicJSON() }, `Account ${isActive ? 'activated' : 'deactivated'}`);
});

/**
 * @route POST /api/users/:id/reset-password
 * @body { newPassword }
 * @access Admin
 */
const resetPassword = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('Invalid user id');

  const newPassword = requirePassword(req.body, 'newPassword');

  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User not found');

  user.password = newPassword;
  user.mustChangePassword = true;
  await user.save();

  await auditService.recordFromRequest(req, {
    entityType: ENTITY_TYPES.USER,
    entityId: user._id,
    entityLabel: user.email,
    action: AUDIT_ACTIONS.CHANGE_PASSWORD,
    description: 'Password reset by administrator',
  });

  sendOk(res, null, 'Password reset. The user must change it at next sign in.');
});

/**
 * @route POST /api/users/me/avatar
 * @body multipart/form-data - image in the "avatar" field (JPG, PNG or WEBP, 2 MB max)
 * @access protected (every role manages their own picture)
 */
const updateMyAvatar = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw ApiError.badRequest(
      'Attach an image in the "avatar" field (JPG, PNG or WEBP up to 2 MB).',
    );
  }

  const user = req.user;
  const previousFileName = user.avatar?.fileName;

  user.avatar = { ...toStoredFile(req.file), uploadedAt: new Date() };
  await user.save();

  // Replace, never accumulate. The superseded file is deleted after the new
  // one is persisted so a cleanup failure can never lose the stored picture.
  if (previousFileName && previousFileName !== user.avatar.fileName) {
    await removeUploadedFile(previousFileName);
  }

  await auditService.recordFromRequest(req, {
    entityType: ENTITY_TYPES.USER,
    entityId: user._id,
    entityLabel: user.email,
    action: AUDIT_ACTIONS.UPDATE,
    description: 'Profile picture updated',
  });

  sendOk(res, { user: user.toPublicJSON() }, 'Profile picture updated');
});

/**
 * @route DELETE /api/users/me/avatar
 * @access protected (every role manages their own picture)
 */
const removeMyAvatar = asyncHandler(async (req, res) => {
  const user = req.user;
  const fileName = user.avatar?.fileName;

  if (!fileName) {
    throw ApiError.badRequest('There is no profile picture to remove.');
  }

  user.avatar = undefined;
  await user.save();
  await removeUploadedFile(fileName);

  await auditService.recordFromRequest(req, {
    entityType: ENTITY_TYPES.USER,
    entityId: user._id,
    entityLabel: user.email,
    action: AUDIT_ACTIONS.UPDATE,
    description: 'Profile picture removed',
  });

  sendOk(res, { user: user.toPublicJSON() }, 'Profile picture removed');
});

module.exports = {
  listUsers,
  getUser,
  createUser,
  updateUser,
  setUserStatus,
  resetPassword,
  updateMyAvatar,
  removeMyAvatar,
};

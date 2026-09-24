const Notification = require('../models/Notification');
const User = require('../models/User');
const { ROLES } = require('../config/constants');
const logger = require('../utils/logger');

/**
 * Notification service.
 * Every business event described in the brief produces an in-app notification
 * for the relevant user(s).
 */

const createNotification = async ({
  user,
  type,
  title,
  message,
  link,
  entityType,
  entityId,
  meta,
}) => {
  if (!user) return null;
  try {
    return await Notification.create({
      user: user._id || user,
      type,
      title,
      message,
      link,
      entityType,
      entityId,
      meta,
    });
  } catch (error) {
    logger.error(`Notification write failed (${type})`, error);
    return null;
  }
};

const notifyMany = async (userIds = [], payload) => {
  const unique = [...new Set(userIds.filter(Boolean).map((id) => String(id)))];
  if (unique.length === 0) return [];
  return Promise.all(unique.map((id) => createNotification({ ...payload, user: id })));
};

const findAdmins = () =>
  User.find({ role: ROLES.ADMIN, isActive: true }).select('_id name email').lean();

/**
 * Finance Managers assigned to a department, falling back to all active
 * Finance Managers when the department has no manager configured.
 */
const findDepartmentFinanceManagers = async (departmentId) => {
  const scoped = departmentId
    ? await User.find({
        role: ROLES.FINANCE_MANAGER,
        isActive: true,
        department: departmentId,
      })
        .select('_id name email')
        .lean()
    : [];
  if (scoped.length > 0) return scoped;
  return User.find({ role: ROLES.FINANCE_MANAGER, isActive: true })
    .select('_id name email')
    .lean();
};

/** Notify every active user with one of the given roles. */
const notifyRoles = async (roles = [], payload) => {
  const users = await User.find({ role: { $in: roles }, isActive: true }).select('_id').lean();
  return notifyMany(users.map((user) => user._id), payload);
};

/** Notify Finance Managers (department scoped) + optionally Admins. */
const notifyFinance = async ({ departmentId, includeAdmins = false, ...payload }) => {
  const finance = await findDepartmentFinanceManagers(departmentId);
  const recipients = finance.map((user) => user._id);
  if (includeAdmins) {
    const admins = await findAdmins();
    recipients.push(...admins.map((admin) => admin._id));
  }
  return notifyMany(recipients, payload);
};

module.exports = {
  createNotification,
  notifyMany,
  notifyRoles,
  notifyFinance,
  findAdmins,
  findDepartmentFinanceManagers,
};

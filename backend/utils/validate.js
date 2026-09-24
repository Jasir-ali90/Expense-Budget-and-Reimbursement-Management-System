const mongoose = require('mongoose');
const ApiError = require('./ApiError');

/**
 * Backend validation helpers.
 * Frontend validation is a convenience only - every rule is re-checked here,
 * because the assignment requires frontend *and* backend validation.
 */

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const toTrimmedString = (value) => (typeof value === 'string' ? value.trim() : value);

const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

/** Require a non empty string with optional length bounds. */
const requireString = (body, field, { min = 1, max = 500, label } = {}) => {
  const raw = toTrimmedString(body?.[field]);
  const name = label || field;
  if (raw === undefined || raw === null || raw === '') {
    throw ApiError.badRequest(`${name} is required`);
  }
  if (typeof raw !== 'string') throw ApiError.badRequest(`${name} must be text`);
  if (raw.length < min) throw ApiError.badRequest(`${name} must be at least ${min} characters`);
  if (raw.length > max) throw ApiError.badRequest(`${name} must be at most ${max} characters`);
  return raw;
};

const optionalString = (body, field, { max = 2000, label } = {}) => {
  const raw = toTrimmedString(body?.[field]);
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw !== 'string') throw ApiError.badRequest(`${label || field} must be text`);
  if (raw.length > max) {
    throw ApiError.badRequest(`${label || field} must be at most ${max} characters`);
  }
  return raw;
};

const requireEmail = (body, field = 'email') => {
  const email = requireString(body, field, { max: 254, label: 'Email' }).toLowerCase();
  if (!isEmail(email)) throw ApiError.badRequest('Please provide a valid email address');
  return email;
};

/** Amounts must be finite, positive numbers with at most 2 decimals. */
const requireAmount = (body, field, { min = 0.01, max = 10000000, label } = {}) => {
  const name = label || field;
  const raw = body?.[field];
  if (raw === undefined || raw === null || raw === '') {
    throw ApiError.badRequest(`${name} is required`);
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) throw ApiError.badRequest(`${name} must be a valid number`);
  if (value < min) throw ApiError.badRequest(`${name} must be at least ${min}`);
  if (value > max) throw ApiError.badRequest(`${name} must not exceed ${max}`);
  const decimals = String(raw).includes('.') ? String(raw).split('.')[1].length : 0;
  if (decimals > 2) throw ApiError.badRequest(`${name} can have at most 2 decimal places`);
  return Math.round(value * 100) / 100;
};

const optionalAmount = (body, field, options = {}) => {
  const raw = body?.[field];
  if (raw === undefined || raw === null || raw === '') return undefined;
  return requireAmount(body, field, options);
};

/** Dates must be parseable and (by default) not in the future. */
const requireDate = (body, field, { label, allowFuture = false } = {}) => {
  const name = label || field;
  const raw = body?.[field];
  if (raw === undefined || raw === null || raw === '') {
    throw ApiError.badRequest(`${name} is required`);
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw ApiError.badRequest(`${name} must be a valid date`);
  if (!allowFuture) {
    const limit = new Date();
    limit.setHours(23, 59, 59, 999);
    if (date > limit) throw ApiError.badRequest(`${name} cannot be in the future`);
  }
  return date;
};

const optionalDate = (body, field, options = {}) => {
  const raw = body?.[field];
  if (raw === undefined || raw === null || raw === '') return undefined;
  return requireDate(body, field, options);
};

const requireObjectId = (body, field, { label } = {}) => {
  const name = label || field;
  const raw = body?.[field];
  if (raw === undefined || raw === null || raw === '') {
    throw ApiError.badRequest(`${name} is required`);
  }
  if (!mongoose.Types.ObjectId.isValid(String(raw))) {
    throw ApiError.badRequest(`${name} is not a valid identifier`);
  }
  return String(raw);
};

const optionalObjectId = (body, field, options = {}) => {
  const raw = body?.[field];
  if (raw === undefined || raw === null || raw === '') return undefined;
  return requireObjectId(body, field, options);
};

const parseEnum = (value, allowed, field) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (!allowed.includes(value)) {
    throw ApiError.badRequest(`${field} must be one of: ${allowed.join(', ')}`);
  }
  return value;
};

const requireEnum = (body, field, allowed, { label } = {}) => {
  const value = parseEnum(body?.[field], allowed, label || field);
  if (value === undefined) throw ApiError.badRequest(`${label || field} is required`);
  return value;
};

const toBoolean = (value, fallback = undefined) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalised = String(value).toLowerCase();
  if (['true', '1', 'yes'].includes(normalised)) return true;
  if (['false', '0', 'no'].includes(normalised)) return false;
  throw ApiError.badRequest('Boolean value expected (true/false)');
};

const requireArray = (body, field, { min = 1, max = 50, label } = {}) => {
  const name = label || field;
  const raw = body?.[field];
  if (!Array.isArray(raw)) throw ApiError.badRequest(`${name} must be an array`);
  if (raw.length < min) throw ApiError.badRequest(`${name} must contain at least ${min} item(s)`);
  if (raw.length > max) throw ApiError.badRequest(`${name} must contain at most ${max} item(s)`);
  return raw;
};

/** Validate pagination numbers coming from the query string. */
const parsePositiveInt = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

/** Password policy used on account creation and on change. */
const requirePassword = (body, field = 'password') => {
  const raw = body?.[field];
  if (typeof raw !== 'string' || raw.length === 0) {
    throw ApiError.badRequest('Password is required');
  }
  if (raw.length < 8) throw ApiError.badRequest('Password must be at least 8 characters long');
  if (raw.length > 128) throw ApiError.badRequest('Password must be at most 128 characters long');
  if (!/[A-Za-z]/.test(raw) || !/[0-9]/.test(raw)) {
    throw ApiError.badRequest('Password must contain at least one letter and one number');
  }
  return raw;
};

/** Employees may only touch their own records. */
const assertOwnership = (actor, ownerId, message = 'You can only access your own records') => {
  const owner = String(ownerId || '');
  if (String(actor?._id || actor?.id) !== owner) {
    throw ApiError.forbidden(message);
  }
  return true;
};

module.exports = {
  isPlainObject,
  isEmail,
  requireString,
  optionalString,
  requireEmail,
  requireAmount,
  optionalAmount,
  requireDate,
  optionalDate,
  requireObjectId,
  optionalObjectId,
  parseEnum,
  requireEnum,
  toBoolean,
  requireArray,
  parsePositiveInt,
  requirePassword,
  assertOwnership,
};

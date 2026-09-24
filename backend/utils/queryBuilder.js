const mongoose = require('mongoose');
const ApiError = require('./ApiError');

/**
 * Server side search / filter / sort / pagination helper.
 * Every list endpoint funnels through this so behaviour is identical
 * everywhere and cannot be bypassed from the client.
 */

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parsePagination = (query = {}) => {
  const rawPage = Number(query.page);
  const rawLimit = Number(query.limit);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : DEFAULT_PAGE;
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), MAX_LIMIT) : DEFAULT_LIMIT;
  return { page, limit, skip: (page - 1) * limit };
};

/**
 * Build a case insensitive "search across these fields" clause.
 */
const buildSearchClause = (search, fields = []) => {
  const term = String(search || '').trim();
  if (!term || fields.length === 0) return null;
  const pattern = new RegExp(escapeRegex(term), 'i');
  return { $or: fields.map((field) => ({ [field]: pattern })) };
};

/**
 * Pick only whitelisted filter keys from the query string.
 * Supports:
 *   ?status=Approved            -> equality
 *   ?status=Approved,Returned   -> $in
 *   ?from=2026-01-01&to=2026-01-31 with a dateField
 *   ?minAmount=10&maxAmount=100 with rangeField
 *   ObjectId values are validated to avoid CastError noise.
 */
const buildFilterClause = (query = {}, options = {}) => {
  const {
    filters = [],
    dateField = null,
    amountField = null,
  } = options;

  const clause = {};

  filters.forEach((definition) => {
    const name = typeof definition === 'string' ? definition : definition.field;
    const type = typeof definition === 'string' ? 'string' : definition.type || 'string';
    const raw = query[name];
    if (raw === undefined || raw === null || raw === '') return;

    const values = String(raw)
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (values.length === 0) return;

    if (type === 'objectId') {
      const valid = values.filter((value) => mongoose.Types.ObjectId.isValid(value));
      if (valid.length === 0) return;
      clause[name] = valid.length === 1 ? valid[0] : { $in: valid };
      return;
    }

    if (type === 'boolean') {
      clause[name] = values[0] === 'true' || values[0] === '1';
      return;
    }

    clause[name] = values.length === 1 ? values[0] : { $in: values };
  });

  if (dateField && (query.from || query.to)) {
    const range = {};
    if (query.from) {
      const start = new Date(query.from);
      if (!Number.isNaN(start.getTime())) {
        start.setHours(0, 0, 0, 0);
        range.$gte = start;
      }
    }
    if (query.to) {
      const end = new Date(query.to);
      if (!Number.isNaN(end.getTime())) {
        end.setHours(23, 59, 59, 999);
        range.$lte = end;
      }
    }
    if (Object.keys(range).length > 0) clause[dateField] = range;
  }

  if (amountField && (query.minAmount !== undefined || query.maxAmount !== undefined)) {
    const range = {};
    const min = Number(query.minAmount);
    const max = Number(query.maxAmount);
    if (Number.isFinite(min)) range.$gte = min;
    if (Number.isFinite(max)) range.$lte = max;
    if (Object.keys(range).length > 0) clause[amountField] = range;
  }

  return clause;
};

/**
 * Build a safe sort object. Only whitelisted fields are accepted and the
 * direction is limited to asc/desc.
 */
const buildSortClause = (sort, allowedFields = [], defaultSort = { createdAt: -1 }) => {
  if (!sort) return defaultSort;
  const [field, direction] = String(sort).split(':');
  if (!field) return defaultSort;
  if (allowedFields.length > 0 && !allowedFields.includes(field)) return defaultSort;
  const order = String(direction || 'desc').toLowerCase() === 'asc' ? 1 : -1;
  return { [field]: order };
};

/**
 * One call that returns everything a controller needs for a list endpoint.
 */
const buildListQuery = (query = {}, options = {}) => {
  const {
    searchFields = [],
    filters = [],
    dateField = null,
    amountField = null,
    sortableFields = [],
    defaultSort = { createdAt: -1 },
  } = options;

  const { page, limit, skip } = parsePagination(query);
  const conditions = [];

  const searchClause = buildSearchClause(query.search, searchFields);
  if (searchClause) conditions.push(searchClause);

  const filterClause = buildFilterClause(query, { filters, dateField, amountField });
  if (Object.keys(filterClause).length > 0) conditions.push(filterClause);

  const filter = conditions.length > 0 ? { $and: conditions } : {};
  const sort = buildSortClause(query.sort, sortableFields, defaultSort);

  return { filter, sort, skip, limit, page };
};

/** Reject unknown enum values coming from the client. */
const assertAllowedValue = (value, allowed, fieldName = 'value') => {
  if (value === undefined || value === null || value === '') return null;
  if (!allowed.includes(value)) {
    throw ApiError.badRequest(
      `${fieldName} must be one of: ${allowed.join(', ')}`,
    );
  }
  return value;
};

module.exports = {
  parsePagination,
  buildSearchClause,
  buildFilterClause,
  buildSortClause,
  buildListQuery,
  assertAllowedValue,
  escapeRegex,
  DEFAULT_LIMIT,
  MAX_LIMIT,
};

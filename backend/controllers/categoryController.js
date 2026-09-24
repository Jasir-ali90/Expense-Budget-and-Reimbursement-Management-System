const mongoose = require('mongoose');
const Category = require('../models/Category');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendOk, sendCreated, sendPaginated } = require('../utils/apiResponse');
const { buildListQuery } = require('../utils/queryBuilder');
const { requireString, optionalString, toBoolean } = require('../utils/validate');
const auditService = require('../services/auditService');
const { AUDIT_ACTIONS, ENTITY_TYPES } = require('../config/constants');

/**
 * Expense category master data controller (Admin writes, others read).
 * Categories carry the receipt requirement and optional per-item claim
 * limit that the claim/expense validators enforce on the backend.
 */

/** Normalise maxClaimAmount: empty/0 means "no limit" (stored as null). */
const parseMaxClaimAmount = (raw) => {
  if (raw === undefined || raw === null || raw === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw ApiError.badRequest('Maximum claim amount must be a positive number');
  }
  return value === 0 ? null : Math.round(value * 100) / 100;
};

/**
 * @route GET /api/categories
 * @query search, isArchived, requiresReceipt, page, limit, sort
 * @access protected (all roles read - employees need it for claim forms)
 */
const listCategories = asyncHandler(async (req, res) => {
  const { filter, sort, skip, limit, page } = buildListQuery(req.query, {
    searchFields: ['name', 'code', 'description'],
    filters: [
      { field: 'isArchived', type: 'boolean' },
      { field: 'requiresReceipt', type: 'boolean' },
    ],
    sortableFields: ['name', 'createdAt', 'maxClaimAmount'],
    defaultSort: { name: 1 },
  });

  const [categories, total] = await Promise.all([
    Category.find(filter).sort(sort).skip(skip).limit(limit),
    Category.countDocuments(filter),
  ]);

  sendPaginated(res, categories, { page, limit, total });
});

/**
 * @route GET /api/categories/:id
 * @access protected
 */
const getCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('Invalid category id');

  const category = await Category.findById(id);
  if (!category) throw ApiError.notFound('Category not found');

  sendOk(res, { category });
});

/**
 * @route POST /api/categories
 * @access Admin
 */
const createCategory = asyncHandler(async (req, res) => {
  const name = requireString(req.body, 'name', { max: 120, label: 'Category name' });
  const code = optionalString(req.body, 'code', { max: 40 });
  const description = optionalString(req.body, 'description', { max: 500 });
  const requiresReceipt = toBoolean(req.body.requiresReceipt, true);
  const maxClaimAmount = parseMaxClaimAmount(req.body.maxClaimAmount);

  const existing = await Category.findOne({ name });
  if (existing) throw ApiError.conflict('A category with this name already exists');

  const category = await Category.create({
    name,
    code: code || null,
    description,
    requiresReceipt,
    maxClaimAmount,
    createdBy: req.user._id,
  });

  await auditService.recordFromRequest(req, {
    entityType: ENTITY_TYPES.CATEGORY,
    entityId: category._id,
    entityLabel: category.name,
    action: AUDIT_ACTIONS.CREATE,
    description: 'Category created',
    after: { name, requiresReceipt, maxClaimAmount },
  });

  sendCreated(res, { category }, 'Category created successfully');
});

/**
 * @route PUT /api/categories/:id
 * @access Admin
 */
const updateCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('Invalid category id');

  const category = await Category.findById(id);
  if (!category) throw ApiError.notFound('Category not found');

  const before = {
    name: category.name,
    requiresReceipt: category.requiresReceipt,
    maxClaimAmount: category.maxClaimAmount,
  };

  if (req.body.name !== undefined) {
    const name = requireString(req.body, 'name', { max: 120, label: 'Category name' });
    if (name !== category.name) {
      const existing = await Category.findOne({ name });
      if (existing) throw ApiError.conflict('A category with this name already exists');
      category.name = name;
    }
  }
  if (req.body.code !== undefined) category.code = optionalString(req.body, 'code', { max: 40 }) || null;
  if (req.body.description !== undefined) {
    category.description = optionalString(req.body, 'description', { max: 500 });
  }
  if (req.body.requiresReceipt !== undefined) {
    category.requiresReceipt = toBoolean(req.body.requiresReceipt, category.requiresReceipt);
  }
  if (req.body.maxClaimAmount !== undefined) {
    category.maxClaimAmount = parseMaxClaimAmount(req.body.maxClaimAmount);
  }

  await category.save();

  await auditService.recordFromRequest(req, {
    entityType: ENTITY_TYPES.CATEGORY,
    entityId: category._id,
    entityLabel: category.name,
    action: AUDIT_ACTIONS.UPDATE,
    description: 'Category updated',
    before,
    after: {
      name: category.name,
      requiresReceipt: category.requiresReceipt,
      maxClaimAmount: category.maxClaimAmount,
    },
  });

  sendOk(res, { category }, 'Category updated successfully');
});

/**
 * @route PATCH /api/categories/:id/archive
 * @body { reason }
 * @access Admin
 */
const archiveCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('Invalid category id');

  const category = await Category.findById(id);
  if (!category) throw ApiError.notFound('Category not found');
  if (category.isArchived) throw ApiError.badRequest('Category is already archived');

  const reason = requireString(req.body, 'reason', { max: 300, label: 'Archive reason' });

  category.isArchived = true;
  category.archivedAt = new Date();
  category.archivedBy = req.user._id;
  category.archiveReason = reason;
  await category.save();

  await auditService.recordFromRequest(req, {
    entityType: ENTITY_TYPES.CATEGORY,
    entityId: category._id,
    entityLabel: category.name,
    action: AUDIT_ACTIONS.ARCHIVE,
    description: 'Category archived (unusable for new claims)',
    reason,
  });

  sendOk(res, { category }, 'Category archived');
});

/**
 * @route PATCH /api/categories/:id/restore
 * @access Admin
 */
const restoreCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('Invalid category id');

  const category = await Category.findById(id);
  if (!category) throw ApiError.notFound('Category not found');
  if (!category.isArchived) throw ApiError.badRequest('Category is not archived');

  category.isArchived = false;
  category.archivedAt = null;
  category.archivedBy = null;
  category.archiveReason = null;
  await category.save();

  await auditService.recordFromRequest(req, {
    entityType: ENTITY_TYPES.CATEGORY,
    entityId: category._id,
    entityLabel: category.name,
    action: AUDIT_ACTIONS.RESTORE,
    description: 'Category restored',
  });

  sendOk(res, { category }, 'Category restored');
});

module.exports = {
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  archiveCategory,
  restoreCategory,
};

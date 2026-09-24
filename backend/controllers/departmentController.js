const mongoose = require('mongoose');
const Department = require('../models/Department');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendOk, sendCreated, sendPaginated } = require('../utils/apiResponse');
const { buildListQuery } = require('../utils/queryBuilder');
const { requireString, optionalString, optionalObjectId } = require('../utils/validate');
const auditService = require('../services/auditService');
const { ROLES, AUDIT_ACTIONS, ENTITY_TYPES } = require('../config/constants');

/**
 * Department master data controller (Admin writes, others read).
 * Departments are archived, never deleted, so historical reports keep
 * resolving department names.
 */

const STAFF_FIELDS = 'name email role isActive';

/**
 * @route GET /api/departments
 * @query search, isArchived, page, limit, sort
 * @access protected (all roles read)
 */
const listDepartments = asyncHandler(async (req, res) => {
  const { filter, sort, skip, limit, page } = buildListQuery(req.query, {
    searchFields: ['name', 'code', 'description'],
    filters: [{ field: 'isArchived', type: 'boolean' }],
    sortableFields: ['name', 'createdAt'],
    defaultSort: { name: 1 },
  });

  const [departments, total] = await Promise.all([
    Department.find(filter).sort(sort).skip(skip).limit(limit).populate('manager', STAFF_FIELDS),
    Department.countDocuments(filter),
  ]);

  // Employee counts per department (active employees only).
  const counts = await User.aggregate([
    { $match: { role: ROLES.EMPLOYEE, isActive: true, department: { $ne: null } } },
    { $group: { _id: '$department', count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((row) => [String(row._id), row.count]));

  sendPaginated(
    res,
    departments.map((dept) => ({
      ...dept.toObject(),
      employeeCount: countMap.get(String(dept._id)) || 0,
    })),
    { page, limit, total },
  );
});

/**
 * @route GET /api/departments/:id
 * @access protected
 */
const getDepartment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('Invalid department id');

  const dept = await Department.findById(id).populate('manager', STAFF_FIELDS);
  if (!dept) throw ApiError.notFound('Department not found');

  const employees = await User.find({ department: dept._id, role: ROLES.EMPLOYEE })
    .select(STAFF_FIELDS)
    .sort({ name: 1 });

  sendOk(res, { department: dept.toObject(), employees });
});

/**
 * @route POST /api/departments
 * @access Admin
 */
const createDepartment = asyncHandler(async (req, res) => {
  const name = requireString(req.body, 'name', { max: 120, label: 'Department name' });
  const code = optionalString(req.body, 'code', { max: 40 });
  const description = optionalString(req.body, 'description', { max: 500 });
  const manager = optionalObjectId(req.body, 'manager');

  const existing = await Department.findOne({ name });
  if (existing) throw ApiError.conflict('A department with this name already exists');

  if (manager) {
    const managerUser = await User.findById(manager);
    if (!managerUser || !managerUser.isActive) {
      throw ApiError.badRequest('Manager must be an active user');
    }
  }

  const dept = await Department.create({
    name,
    code: code || null,
    description,
    manager: manager || null,
    createdBy: req.user._id,
  });

  await auditService.recordFromRequest(req, {
    entityType: ENTITY_TYPES.DEPARTMENT,
    entityId: dept._id,
    entityLabel: dept.name,
    action: AUDIT_ACTIONS.CREATE,
    description: 'Department created',
    after: { name },
  });

  sendCreated(res, { department: dept }, 'Department created successfully');
});

/**
 * @route PUT /api/departments/:id
 * @access Admin
 */
const updateDepartment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('Invalid department id');

  const dept = await Department.findById(id);
  if (!dept) throw ApiError.notFound('Department not found');

  const before = { name: dept.name, manager: String(dept.manager || '') };
  const name = req.body.name !== undefined
    ? requireString(req.body, 'name', { max: 120, label: 'Department name' })
    : undefined;
  const code = req.body.code !== undefined ? optionalString(req.body, 'code', { max: 40 }) : undefined;
  const description = req.body.description !== undefined
    ? optionalString(req.body, 'description', { max: 500 })
    : undefined;
  const manager = req.body.manager !== undefined ? optionalObjectId(req.body, 'manager') : undefined;

  if (name && name !== dept.name) {
    const existing = await Department.findOne({ name });
    if (existing) throw ApiError.conflict('A department with this name already exists');
    dept.name = name;
  }
  if (code !== undefined) dept.code = code || null;
  if (description !== undefined) dept.description = description;

  if (manager !== undefined) {
    if (manager) {
      const managerUser = await User.findById(manager);
      if (!managerUser || !managerUser.isActive) {
        throw ApiError.badRequest('Manager must be an active user');
      }
    }
    dept.manager = manager || null;
  }

  await dept.save();

  await auditService.recordFromRequest(req, {
    entityType: ENTITY_TYPES.DEPARTMENT,
    entityId: dept._id,
    entityLabel: dept.name,
    action: AUDIT_ACTIONS.UPDATE,
    description: 'Department updated',
    before,
    after: { name: dept.name, manager: String(dept.manager || '') },
  });

  sendOk(res, { department: dept }, 'Department updated successfully');
});

/**
 * @route PATCH /api/departments/:id/archive
 * @body { reason }
 * @access Admin
 */
const archiveDepartment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('Invalid department id');

  const dept = await Department.findById(id);
  if (!dept) throw ApiError.notFound('Department not found');
  if (dept.isArchived) throw ApiError.badRequest('Department is already archived');

  const reason = requireString(req.body, 'reason', { max: 300, label: 'Archive reason' });

  dept.isArchived = true;
  dept.archivedAt = new Date();
  dept.archivedBy = req.user._id;
  dept.archiveReason = reason;
  await dept.save();

  await auditService.recordFromRequest(req, {
    entityType: ENTITY_TYPES.DEPARTMENT,
    entityId: dept._id,
    entityLabel: dept.name,
    action: AUDIT_ACTIONS.ARCHIVE,
    description: 'Department archived',
    reason,
  });

  sendOk(res, { department: dept }, 'Department archived');
});

/**
 * @route PATCH /api/departments/:id/restore
 * @access Admin
 */
const restoreDepartment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('Invalid department id');

  const dept = await Department.findById(id);
  if (!dept) throw ApiError.notFound('Department not found');
  if (!dept.isArchived) throw ApiError.badRequest('Department is not archived');

  dept.isArchived = false;
  dept.archivedAt = null;
  dept.archivedBy = null;
  dept.archiveReason = null;
  await dept.save();

  await auditService.recordFromRequest(req, {
    entityType: ENTITY_TYPES.DEPARTMENT,
    entityId: dept._id,
    entityLabel: dept.name,
    action: AUDIT_ACTIONS.RESTORE,
    description: 'Department restored',
  });

  sendOk(res, { department: dept }, 'Department restored');
});

module.exports = {
  listDepartments,
  getDepartment,
  createDepartment,
  updateDepartment,
  archiveDepartment,
  restoreDepartment,
};

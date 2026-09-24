const Budget = require('../models/Budget');
const Department = require('../models/Department');
const Category = require('../models/Category');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendOk, sendCreated, sendMessage, sendPaginated } = require('../utils/apiResponse');
const { buildListQuery, parsePagination } = require('../utils/queryBuilder');
const {
  requireObjectId,
  requireEnum,
  requireString,
  optionalString,
  requireAmount,
} = require('../utils/validate');
const { round2 } = require('../utils/money');
const { isValidPeriod, periodLabel } = require('../utils/period');
const budgetService = require('../services/budgetService');
const auditService = require('../services/auditService');
const {
  BUDGET_PERIOD_TYPE,
  BUDGET_PERIOD_TYPE_VALUES,
  AUDIT_ACTIONS,
  ENTITY_TYPES,
} = require('../config/constants');

/**
 * Budget controller.
 * All totals (allocated/used/committed/remaining) are derived server side by
 * the budget service; clients can never post usage numbers.
 */

/**
 * @route GET /api/budgets
 * @query department, category, periodType, period, page, limit, sort
 * @access Admin, Finance Manager
 */
const listBudgets = asyncHandler(async (req, res) => {
  const { filter, sort, skip, limit, page } = buildListQuery(req.query, {
    filters: [
      { field: 'department', type: 'objectId' },
      { field: 'category', type: 'objectId' },
      { field: 'periodType', type: 'string' },
      { field: 'period', type: 'string' },
    ],
    sortableFields: ['period', 'createdAt', 'allocatedAmount'],
    defaultSort: { period: -1 },
  });

  const [budgets, total] = await Promise.all([
    Budget.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('department', 'name code isArchived')
      .populate('category', 'name code isArchived'),
    Budget.countDocuments(filter),
  ]);

  const decorated = await budgetService.decorateBudgets(budgets);

  sendPaginated(
    res,
    decorated.map(({ budget, usage }) => ({
      ...budget.toJSON(),
      usage,
    })),
    { page, limit, total },
  );
});

/**
 * @route GET /api/budgets/:id
 * @access Admin, Finance Manager
 */
const getBudget = asyncHandler(async (req, res) => {
  const budget = await Budget.findById(req.params.id)
    .populate('department', 'name code isArchived')
    .populate('category', 'name code isArchived');
  if (!budget) throw ApiError.notFound('Budget not found');

  const [decorated] = await budgetService.decorateBudgets([budget]);

  sendOk(res, {
    budget: {
      ...decorated.budget.toJSON(),
      usage: decorated.usage,
    },
  });
});

/**
 * @route POST /api/budgets
 * @access Admin
 * Duplicates for the same department + category + period are rejected (the
 * unique index is the hard stop, the pre-check gives a friendly message).
 */
const createBudget = asyncHandler(async (req, res) => {
  const department = requireObjectId(req.body, 'department', { label: 'Department' });
  const category = requireObjectId(req.body, 'category', { label: 'Category' });
  const periodType = requireEnum(req.body, 'periodType', BUDGET_PERIOD_TYPE_VALUES, {
    label: 'Period type',
  });
  const period = requireString(req.body, 'period', { max: 7, label: 'Period' });
  const allocatedAmount = requireAmount(req.body, 'allocatedAmount', { min: 1, label: 'Allocated amount' });
  const notes = optionalString(req.body, 'notes', { max: 500 });

  if (!isValidPeriod(period, periodType)) {
    throw ApiError.badRequest(
      'Period must use YYYY-MM for monthly budgets or YYYY for yearly budgets',
    );
  }
  if (periodType === BUDGET_PERIOD_TYPE.MONTHLY && period.length !== 7) {
    throw ApiError.badRequest('A monthly budget requires a YYYY-MM period');
  }
  if (periodType === BUDGET_PERIOD_TYPE.YEARLY && period.length !== 4) {
    throw ApiError.badRequest('A yearly budget requires a YYYY period');
  }

  const [dept, cat] = await Promise.all([
    Department.findById(department),
    Category.findById(category),
  ]);
  if (!dept || dept.isArchived) throw ApiError.badRequest('Department does not exist or is archived');
  if (!cat || cat.isArchived) throw ApiError.badRequest('Category does not exist or is archived');

  const duplicate = await Budget.findOne({ department, category, period });
  if (duplicate) {
    throw ApiError.conflict(
      `A ${periodType.toLowerCase()} budget for this department, category and ${periodLabel(period)} already exists`,
    );
  }

  const budget = await Budget.create({
    department,
    category,
    periodType,
    period,
    allocatedAmount,
    notes,
    createdBy: req.user._id,
  });

  await auditService.recordFromRequest(req, {
    entityType: ENTITY_TYPES.BUDGET,
    entityId: budget._id,
    entityLabel: `${dept.name} / ${cat.name} - ${period}`,
    action: AUDIT_ACTIONS.CREATE,
    description: `Budget created for ${period} (${allocatedAmount})`,
    after: { allocatedAmount, warningThresholdPercent: budget.warningThresholdPercent },
  });

  const [decorated] = await budgetService.decorateBudgets([
    await Budget.findById(budget._id)
      .populate('department', 'name code isArchived')
      .populate('category', 'name code isArchived'),
  ]);

  sendCreated(
    res,
    { budget: { ...decorated.budget.toJSON(), usage: decorated.usage } },
    'Budget created successfully',
  );
});

/**
 * @route POST /api/budgets/:id/revise
 * @body { allocatedAmount, warningThresholdPercent?, reason }
 * @access Admin
 * A revision reason is mandatory and every change is stored in the budget's
 * own history plus the central audit log.
 */
const reviseBudget = asyncHandler(async (req, res) => {
  const budget = await Budget.findById(req.params.id)
    .populate('department', 'name code')
    .populate('category', 'name code');
  if (!budget) throw ApiError.notFound('Budget not found');

  const allocatedAmount = requireAmount(req.body, 'allocatedAmount', {
    min: 0,
    label: 'Allocated amount',
  });
  const reason = requireString(req.body, 'reason', { max: 500, label: 'Revision reason' });

  const updated = await budgetService.reviseBudget({
    budget,
    newAmount: allocatedAmount,
    newWarningThresholdPercent:
      req.body.warningThresholdPercent !== undefined
        ? Number(req.body.warningThresholdPercent)
        : undefined,
    reason,
    actor: req.user,
    req,
  });

  const [decorated] = await budgetService.decorateBudgets([
    await Budget.findById(updated._id)
      .populate('department', 'name code isArchived')
      .populate('category', 'name code isArchived'),
  ]);

  sendOk(
    res,
    { budget: { ...decorated.budget.toJSON(), usage: decorated.usage } },
    'Budget revised successfully',
  );
});

/**
 * @route DELETE /api/budgets/:id
 * @access Admin
 * A budget that already carries spending or commitments cannot be deleted -
 * it must be revised to zero instead, keeping the audit trail intact.
 */
const deleteBudget = asyncHandler(async (req, res) => {
  const budget = await Budget.findById(req.params.id);
  if (!budget) throw ApiError.notFound('Budget not found');

  const [decorated] = await budgetService.decorateBudgets([budget], { evaluate: false });
  const { used, committed } = decorated.usage;
  if (round2(used + committed) > 0) {
    throw ApiError.badRequest(
      'This budget already has spending or commitments. Revise the allocated amount instead of deleting it.',
    );
  }

  await budget.deleteOne();

  await auditService.recordFromRequest(req, {
    entityType: ENTITY_TYPES.BUDGET,
    entityId: budget._id,
    entityLabel: budget.period,
    action: AUDIT_ACTIONS.DELETE,
    description: `Budget ${budget.period} deleted`,
    before: { allocatedAmount: budget.allocatedAmount },
  });

  sendMessage(res, 'Budget deleted successfully');
});

module.exports = {
  listBudgets,
  getBudget,
  createBudget,
  reviseBudget,
  deleteBudget,
};

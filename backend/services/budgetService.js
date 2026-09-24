const mongoose = require('mongoose');
const Budget = require('../models/Budget');
const Expense = require('../models/Expense');
const Claim = require('../models/Claim');
const ApiError = require('../utils/ApiError');
const { round2, percentOf } = require('../utils/money');
const { periodToRange } = require('../utils/period');
const notificationService = require('./notificationService');
const auditService = require('./auditService');
const { ENTITY_TYPES, AUDIT_ACTIONS, NOTIFICATION_TYPES } = require('../config/constants');

/**
 * Budget service - the financial calculation core.
 *
 * Business rules enforced here:
 *   - Allocated / used / committed / remaining are ALWAYS derived on the
 *     backend; values sent by any client are ignored.
 *   - "used"      = approved + paid direct expenses and approved + paid claim
 *                   items (approved amounts).
 *   - "committed" = submitted (pending approval) direct expenses and claim
 *                   items (requested amounts).
 *   - Draft, Returned and Rejected records are never counted.
 *   - Direct expenses count toward a budget through their `date`; claims
 *     count through their submission date (the moment money is committed)
 *     and are aggregated at item level, so one claim can touch several
 *     department/category budgets.
 *   - Warning / exceeded notifications fire once per budget (one-shot flags)
 *     and are re-armed whenever the budget is revised.
 */

const toObjectId = (value) => {
  if (!value) return undefined;
  if (value instanceof mongoose.Types.ObjectId) return value;
  return mongoose.isValidObjectId(String(value))
    ? new mongoose.Types.ObjectId(String(value))
    : undefined;
};

const emptyBucket = () => ({
  usedDirect: 0,
  usedDirectCount: 0,
  committedDirect: 0,
  committedDirectCount: 0,
  usedClaims: 0,
  usedClaimsCount: 0,
  committedClaims: 0,
  committedClaimsCount: 0,
});

/**
 * Build usage buckets for a scope with four batched aggregations.
 * Returns a Map keyed by `${departmentId}:${categoryId}`.
 *
 * @param {Object} scope
 * @param {ObjectId|string} [scope.departmentId] restrict to one department
 * @param {Array} [scope.categoryIds] restrict to these categories
 * @param {{start:Date, end:Date}} scope.range inclusive date range
 */
const buildUsageMap = async ({ departmentId, categoryIds, range }) => {
  const deptId = toObjectId(departmentId);
  const catIds = (categoryIds || []).map(toObjectId).filter(Boolean);

  const expenseMatch = { date: { $gte: range.start, $lte: range.end } };
  if (deptId) expenseMatch.department = deptId;
  if (catIds.length > 0) expenseMatch.category = { $in: catIds };

  const claimMatch = { submittedAt: { $gte: range.start, $lte: range.end } };
  if (deptId) claimMatch.department = deptId;

  const claimItemMatch = catIds.length > 0
    ? [{ $match: { 'items.category': { $in: catIds } } }]
    : [];

  const [directUsed, directPending, claimUsed, claimPending] = await Promise.all([
    // Approved + paid direct expenses (approvedAmount when set, else amount)
    Expense.aggregate([
      { $match: { ...expenseMatch, status: { $in: ['Approved', 'Paid'] } } },
      {
        $group: {
          _id: { department: '$department', category: '$category' },
          amount: {
            $sum: { $cond: [{ $gt: ['$approvedAmount', 0] }, '$approvedAmount', '$amount'] },
          },
          count: { $sum: 1 },
        },
      },
    ]),
    // Submitted direct expenses awaiting approval
    Expense.aggregate([
      { $match: { ...expenseMatch, status: 'Submitted' } },
      {
        $group: {
          _id: { department: '$department', category: '$category' },
          amount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]),
    // Approved + paid claim items, unwound to item level
    Claim.aggregate([
      { $match: { ...claimMatch, status: { $in: ['Approved', 'Paid'] } } },
      { $unwind: '$items' },
      ...claimItemMatch,
      {
        $group: {
          _id: { department: '$department', category: '$items.category' },
          amount: { $sum: '$items.approvedAmount' },
          count: { $sum: 1 },
        },
      },
    ]),
    // Submitted claim items awaiting review
    Claim.aggregate([
      { $match: { ...claimMatch, status: 'Submitted' } },
      { $unwind: '$items' },
      ...claimItemMatch,
      {
        $group: {
          _id: { department: '$department', category: '$items.category' },
          amount: { $sum: '$items.requestedAmount' },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const map = new Map();
  const bucketFor = (department, category) => {
    const key = `${department}:${category}`;
    let bucket = map.get(key);
    if (!bucket) {
      bucket = emptyBucket();
      map.set(key, bucket);
    }
    return bucket;
  };

  const mergeRows = (rows, apply) => {
    rows.forEach((row) => {
      if (!row?._id?.department || !row?._id?.category) return;
      const bucket = bucketFor(String(row._id.department), String(row._id.category));
      apply(bucket, row);
    });
  };

  mergeRows(directUsed, (bucket, row) => {
    bucket.usedDirect = round2(bucket.usedDirect + row.amount);
    bucket.usedDirectCount += row.count;
  });
  mergeRows(directPending, (bucket, row) => {
    bucket.committedDirect = round2(bucket.committedDirect + row.amount);
    bucket.committedDirectCount += row.count;
  });
  mergeRows(claimUsed, (bucket, row) => {
    bucket.usedClaims = round2(bucket.usedClaims + row.amount);
    bucket.usedClaimsCount += row.count;
  });
  mergeRows(claimPending, (bucket, row) => {
    bucket.committedClaims = round2(bucket.committedClaims + row.amount);
    bucket.committedClaimsCount += row.count;
  });

  return map;
};

/** Turn a raw usage bucket into the API shape for one budget. */
const decorateUsage = (budget, bucket) => {
  const safeBucket = bucket || emptyBucket();
  const allocated = round2(budget.allocatedAmount);
  const used = round2(safeBucket.usedDirect + safeBucket.usedClaims);
  const committed = round2(safeBucket.committedDirect + safeBucket.committedClaims);
  const remaining = round2(allocated - used - committed);
  const usagePercent = percentOf(used + committed, allocated);
  const warningThresholdPercent = budget.warningThresholdPercent || 80;

  return {
    allocated,
    used,
    committed,
    remaining,
    usedPercent: percentOf(used, allocated),
    committedPercent: percentOf(committed, allocated),
    usagePercent,
    warningThresholdPercent,
    isWarning: usagePercent >= warningThresholdPercent && remaining >= 0,
    isExceeded: remaining < 0,
    breakdown: {
      directExpenses: {
        used: safeBucket.usedDirect,
        committed: safeBucket.committedDirect,
        count: safeBucket.usedDirectCount + safeBucket.committedDirectCount,
      },
      claims: {
        used: safeBucket.usedClaims,
        committed: safeBucket.committedClaims,
        count: safeBucket.usedClaimsCount + safeBucket.committedClaimsCount,
      },
    },
  };
};

/**
 * Evaluate warning / exceeded thresholds for a set of budgets and emit
 * one-shot notifications. One-shot flags are stored on the budget document
 * (`thresholdsNotified`) so Finance is never spammed, and both flags are
 * re-armed by `reviseBudget`.
 *
 * @param {Array<Object>} decorated list of { budget, usage } pairs
 * @returns {Promise<Array>} budgets whose state changed (warning/exceeded)
 */
const evaluateBudgets = async (decorated) => {
  const changed = [];

  for (const { budget, usage } of decorated) {
    const flags = budget.thresholdsNotified || { warning: false, exceeded: false };
    const updates = {};

    if (usage.isExceeded && !flags.exceeded) {
      updates['thresholdsNotified.exceeded'] = true;
      await notificationService.notifyFinance({
        departmentId: budget.department,
        type: NOTIFICATION_TYPES.BUDGET_EXCEEDED,
        title: `Budget exceeded - ${budget.categoryName || 'category'}`,
        message: `The ${budget.period} budget for ${
          budget.departmentName || 'a department'
        } / ${budget.categoryName || 'a category'} is over its limit. Used: ${
          usage.used
        }, committed: ${usage.committed}, allocated: ${usage.allocated}.`,
        link: `/budgets?period=${budget.period}`,
        entityType: ENTITY_TYPES.BUDGET,
        entityId: budget._id,
      });
      await auditService.record({
        entityType: ENTITY_TYPES.BUDGET,
        entityId: budget._id,
        entityLabel: budget.period,
        action: AUDIT_ACTIONS.UPDATE,
        description: `Budget limit exceeded (${usage.usagePercent}% of allocation)`,
        after: { usagePercent: usage.usagePercent, remaining: usage.remaining },
      });
      changed.push({ budget, usage, state: 'exceeded' });
    } else if (usage.isWarning && !flags.warning && !flags.exceeded) {
      updates['thresholdsNotified.warning'] = true;
      await notificationService.notifyFinance({
        departmentId: budget.department,
        type: NOTIFICATION_TYPES.BUDGET_WARNING,
        title: `Budget warning - ${budget.categoryName || 'category'}`,
        message: `The ${budget.period} budget for ${
          budget.departmentName || 'a department'
        } / ${budget.categoryName || 'a category'} has reached ${usage.usagePercent}% of its allocation.`,
        link: `/budgets?period=${budget.period}`,
        entityType: ENTITY_TYPES.BUDGET,
        entityId: budget._id,
      });
      changed.push({ budget, usage, state: 'warning' });
    }

    if (Object.keys(updates).length > 0) {
      await Budget.updateOne({ _id: budget._id }, { $set: updates });
    }
  }

  return changed;
};

/**
 * Derive usage for a list of budget documents (batched aggregations per
 * period) and decorate each with the API shape. Threshold notifications are
 * evaluated as part of the call so any read path keeps the flags current.
 *
 * @param {Array<Budget>} budgets
 * @param {Object} [options]
 * @param {boolean} [options.evaluate=true] fire threshold notifications
 */
const decorateBudgets = async (budgets, { evaluate = true } = {}) => {
  if (!Array.isArray(budgets) || budgets.length === 0) return [];

  const periods = [...new Set(budgets.map((budget) => budget.period))];
  const categoryIds = [
    ...new Set(budgets.map((budget) => String(budget.category?._id || budget.category))),
  ];

  // Usage must be computed per period - budgets in different periods never mix.
  const usageByPeriod = new Map();
  for (const period of periods) {
    // eslint-disable-next-line no-await-in-loop
    usageByPeriod.set(
      period,
      await buildUsageMap({
        categoryIds,
        range: periodToRange(period),
      }),
    );
  }

  const decorated = budgets.map((budget) => {
    const usageMap = usageByPeriod.get(budget.period);
    const key = `${String(budget.department?._id || budget.department)}:${String(
      budget.category?._id || budget.category,
    )}`;
    return { budget, usage: decorateUsage(budget, usageMap.get(key)) };
  });

  if (evaluate) {
    await evaluateBudgets(decorated);
  }

  return decorated;
};

/**
 * Revise a budget (Admin only, reason mandatory) and record the change in
 * the audit history + notification feed. Re-arms threshold notifications.
 */
const reviseBudget = async ({ budget, newAmount, newWarningThresholdPercent, reason, actor, req }) => {
  if (!reason || !String(reason).trim()) {
    throw ApiError.badRequest('A revision reason is required');
  }
  const amount = round2(newAmount);
  if (!Number.isFinite(amount) || amount < 0) {
    throw ApiError.badRequest('The new allocated amount must be a positive number');
  }

  const previousAmount = round2(budget.allocatedAmount);
  const previousThreshold = budget.warningThresholdPercent;
  const nextThreshold =
    newWarningThresholdPercent !== undefined && newWarningThresholdPercent !== null
      ? newWarningThresholdPercent
      : previousThreshold;

  budget.history.push({
    revisedBy: actor._id,
    revisedByName: actor.name,
    previousAmount,
    newAmount: amount,
    previousWarningThresholdPercent: previousThreshold,
    newWarningThresholdPercent: nextThreshold,
    reason: String(reason).trim(),
  });
  budget.allocatedAmount = amount;
  budget.warningThresholdPercent = nextThreshold;
  budget.thresholdsNotified = { warning: false, exceeded: false };

  await budget.save();

  await auditService.recordFromRequest(req, {
    entityType: ENTITY_TYPES.BUDGET,
    entityId: budget._id,
    entityLabel: budget.period,
    action: AUDIT_ACTIONS.REVISE_BUDGET,
    description: `Budget ${budget.period} revised from ${previousAmount} to ${amount}`,
    reason: String(reason).trim(),
    before: { allocatedAmount: previousAmount, warningThresholdPercent: previousThreshold },
    after: { allocatedAmount: amount, warningThresholdPercent: nextThreshold },
  });

  await notificationService.notifyFinance({
    departmentId: budget.department,
    type: NOTIFICATION_TYPES.BUDGET_REVISED,
    title: `Budget revised - ${budget.categoryName || 'category'}`,
    message: `The ${budget.period} budget for ${
      budget.departmentName || 'a department'
    } / ${budget.categoryName || 'a category'} was revised from ${previousAmount} to ${amount}. Reason: ${String(
      reason,
    ).trim()}`,
    link: `/budgets?period=${budget.period}`,
    entityType: ENTITY_TYPES.BUDGET,
    entityId: budget._id,
  });

  return budget;
};

module.exports = {
  buildUsageMap,
  decorateUsage,
  decorateBudgets,
  evaluateBudgets,
  reviseBudget,
  emptyBucket,
};

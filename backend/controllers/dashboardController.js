const Expense = require('../models/Expense');
const Claim = require('../models/Claim');
const Budget = require('../models/Budget');
const Notification = require('../models/Notification');
const asyncHandler = require('../utils/asyncHandler');
const { sendOk } = require('../utils/apiResponse');
const { round2 } = require('../utils/money');
const { resolveDateRange, listMonthlyPeriods, periodToRange, currentPeriod } = require('../utils/period');
const budgetService = require('../services/budgetService');
const { CLAIM_STATUS, EXPENSE_STATUS, ROLES } = require('../config/constants');

/**
 * Dashboard controller - role aware summary widgets.
 * All totals are computed on the server from the raw records; the client
 * never calculates financial figures.
 */

/**
 * Resolve the reporting window from ?from/?to or ?period, defaulting to the
 * last 6 months up to today so the dashboard always shows something useful.
 */
const resolveWindow = (query) => {
  if (query.period) {
    const range = periodToRange(query.period);
    if (range) return { ...range, period: query.period, label: query.period };
  }
  const explicit = resolveDateRange({ from: query.from, to: query.to });
  if (explicit && explicit.start && explicit.end) {
    return { start: explicit.start, end: explicit.end, period: null };
  }

  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end.getFullYear(), end.getMonth() - 5, 1, 0, 0, 0, 0);
  return { start, end, period: null };
};

/** Counts + money for the claim lifecycle within the window. */
const claimSummary = async (match) => {
  const rows = await Claim.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        requested: { $sum: '$totalRequested' },
        approved: { $sum: '$totalApproved' },
        paid: { $sum: '$totalPaid' },
      },
    },
  ]);

  const byStatus = {};
  let totalRequests = 0;
  let totalRequested = 0;
  let totalApproved = 0;
  let totalPaid = 0;
  Object.values(CLAIM_STATUS).forEach((status) => {
    byStatus[status] = { count: 0, requested: 0, approved: 0, paid: 0 };
  });

  rows.forEach((row) => {
    const bucket = byStatus[row._id] || { count: 0, requested: 0, approved: 0, paid: 0 };
    bucket.count += row.count;
    bucket.requested = round2(bucket.requested + row.requested);
    bucket.approved = round2(bucket.approved + row.approved);
    bucket.paid = round2(bucket.paid + row.paid);

    totalRequests += row.count;
    totalRequested = round2(totalRequested + row.requested);
    totalApproved = round2(totalApproved + row.approved);
    totalPaid = round2(totalPaid + row.paid);
  });

  return { byStatus, totalRequests, totalRequested, totalApproved, totalPaid };
};

/** Direct expense totals + top vendors/categories within the window. */
const expenseSummary = async (match) => {
  const [statusRows, topCategories, topVendors] = await Promise.all([
    Expense.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          amount: { $sum: '$amount' },
          approved: {
            $sum: { $cond: [{ $gt: ['$approvedAmount', 0] }, '$approvedAmount', '$amount'] },
          },
        },
      },
    ]),
    Expense.aggregate([
      { $match: { ...match, status: { $nin: [EXPENSE_STATUS.DRAFT, EXPENSE_STATUS.REJECTED] } } },
      {
        $group: {
          _id: '$categoryName',
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
      { $limit: 5 },
    ]),
    Expense.aggregate([
      { $match: { ...match, status: { $nin: [EXPENSE_STATUS.DRAFT, EXPENSE_STATUS.REJECTED] } } },
      { $group: { _id: '$vendor', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
      { $limit: 5 },
    ]),
  ]);

  const byStatus = {};
  let total = 0;
  let totalApproved = 0;
  let totalCount = 0;
  Object.values(EXPENSE_STATUS).forEach((status) => {
    byStatus[status] = { count: 0, amount: 0, approved: 0 };
  });

  statusRows.forEach((row) => {
    const bucket = byStatus[row._id] || { count: 0, amount: 0, approved: 0 };
    bucket.count += row.count;
    bucket.amount = round2(bucket.amount + row.amount);
    bucket.approved = round2(bucket.approved + row.approved);
    total = round2(total + row.amount);
    totalApproved = round2(totalApproved + row.approved);
    totalCount += row.count;
  });

  return {
    byStatus,
    total,
    totalApproved,
    totalCount,
    topCategories: topCategories.map((row) => ({
      name: row._id || 'Uncategorised',
      total: round2(row.total),
      count: row.count,
    })),
    topVendors: topVendors.map((row) => ({
      name: row._id || 'Unknown vendor',
      total: round2(row.total),
      count: row.count,
    })),
  };
};

/** Month by month spend (direct expenses + approved claim items). */
const monthlyTrend = async ({ start, end, departmentId }) => {
  const deptMatch = departmentId ? { department: departmentId } : {};
  const expenseMatch = { date: { $gte: start, $lte: end }, ...deptMatch };
  const claimMatch = { submittedAt: { $gte: start, $lte: end }, ...deptMatch };

  const [expenseRows, claimRows] = await Promise.all([
    Expense.aggregate([
      { $match: { ...expenseMatch, status: { $in: [EXPENSE_STATUS.APPROVED, EXPENSE_STATUS.PAID] } } },
      {
        $group: {
          _id: { y: { $year: '$date' }, m: { $month: '$date' } },
          amount: {
            $sum: { $cond: [{ $gt: ['$approvedAmount', 0] }, '$approvedAmount', '$amount'] },
          },
          count: { $sum: 1 },
        },
      },
    ]),
    Claim.aggregate([
      { $match: { ...claimMatch, status: { $in: [CLAIM_STATUS.APPROVED, CLAIM_STATUS.PAID] } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: { y: { $year: '$submittedAt' }, m: { $month: '$submittedAt' } },
          amount: { $sum: '$items.approvedAmount' },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const toMap = (rows) => {
    const map = new Map();
    rows.forEach((row) => {
      map.set(`${row._id.y}-${String(row._id.m).padStart(2, '0')}`, {
        amount: round2(row.amount),
        count: row.count,
      });
    });
    return map;
  };
  const expenseMap = toMap(expenseRows);
  const claimMap = toMap(claimRows);

  return listMonthlyPeriods(start, end).map(({ period, label }) => {
    const direct = expenseMap.get(period) || { amount: 0, count: 0 };
    const claims = claimMap.get(period) || { amount: 0, count: 0 };
    return {
      period,
      label,
      directExpenses: direct.amount,
      reimbursements: claims.amount,
      total: round2(direct.amount + claims.amount),
      count: direct.count + claims.count,
    };
  });
};

/**
 * @route GET /api/dashboard
 * @query from, to, period, department
 * @access protected - the payload is scoped by role:
 *   Admin / Finance Manager: company wide figures
 *   Employee: their own claim figures only
 */
const getDashboard = asyncHandler(async (req, res) => {
  const window = resolveWindow(req.query);
  const { start, end } = window;
  const isEmployee = req.user.role === ROLES.EMPLOYEE;

  const claimScope = isEmployee ? { employee: req.user._id } : {};
  if (!isEmployee && req.query.department) claimScope.department = req.query.department;

  const claimMatch = { submittedAt: { $gte: start, $lte: end }, ...claimScope };
  const claims = await claimSummary(claimMatch);

  // Pending + overdue are point-in-time figures, not window bound.
  const [pending, overdue] = await Promise.all([
    Claim.countDocuments({ status: CLAIM_STATUS.SUBMITTED, ...claimScope }),
    Claim.countDocuments({
      status: CLAIM_STATUS.SUBMITTED,
      dueAt: { $lt: new Date() },
      ...claimScope,
    }),
  ]);

  if (isEmployee) {
    const [recentClaims, unread, draftCount, returnedCount] = await Promise.all([
      Claim.find({ employee: req.user._id })
        .sort({ updatedAt: -1 })
        .limit(5)
        .select('claimNo title status totalRequested totalApproved totalPaid submittedAt dueAt'),
      Notification.countDocuments({ user: req.user._id, isRead: false }),
      Claim.countDocuments({ employee: req.user._id, status: CLAIM_STATUS.DRAFT }),
      Claim.countDocuments({ employee: req.user._id, status: CLAIM_STATUS.RETURNED }),
    ]);

    return sendOk(res, {
      role: req.user.role,
      window: { from: start, to: end, period: window.period || null },
      claims: {
        ...claims,
        pending,
        overdue,
        drafts: draftCount,
        awaitingCorrection: returnedCount,
      },
      notifications: { unread },
      recentClaims,
      // Employees do not see company budgets or other people's spending.
      budgets: [],
      expenses: null,
      monthlyTrend: [],
    });
  }

  // Finance / Admin: budgets + direct expenses + trend.
  const budgetFilter = { periodType: 'Monthly', period: currentPeriod('Monthly') };
  if (req.query.department) budgetFilter.department = req.query.department;
  const budgetDocs = await Budget.find(budgetFilter)
    .populate('department', 'name')
    .populate('category', 'name');
  const decorated = await budgetService.decorateBudgets(budgetDocs, { evaluate: true });

  const budgets = decorated.map(({ budget, usage }) => ({
    id: budget._id,
    department: budget.department?.name || 'Unknown',
    category: budget.category?.name || 'Unknown',
    period: budget.period,
    ...usage,
  }));

  const budgetTotals = budgets.reduce(
    (accumulator, budget) => ({
      allocated: round2(accumulator.allocated + budget.allocated),
      used: round2(accumulator.used + budget.used),
      committed: round2(accumulator.committed + budget.committed),
      remaining: round2(accumulator.remaining + budget.remaining),
    }),
    { allocated: 0, used: 0, committed: 0, remaining: 0 },
  );

  const expenseMatch = { date: { $gte: start, $lte: end } };
  if (req.query.department) expenseMatch.department = req.query.department;
  const expenses = await expenseSummary(expenseMatch);

  const trend = await monthlyTrend({
    start,
    end,
    departmentId: req.query.department || null,
  });

  const [unread, pendingExpenses, recentClaims] = await Promise.all([
    Notification.countDocuments({ user: req.user._id, isRead: false }),
    Expense.countDocuments({ status: EXPENSE_STATUS.SUBMITTED }),
    Claim.find(claimScope)
      .sort({ submittedAt: -1 })
      .limit(5)
      .select('claimNo title status totalRequested totalApproved submittedAt dueAt employeeName'),
  ]);

  return sendOk(res, {
    role: req.user.role,
    window: { from: start, to: end, period: window.period || null },
    claims: { ...claims, pending, overdue },
    budgets,
    budgetTotals,
    expenses,
    monthlyTrend: trend,
    notifications: { unread },
    pendingExpenseApprovals: pendingExpenses,
    recentClaims,
  });
});

module.exports = { getDashboard };

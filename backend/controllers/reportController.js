const Expense = require('../models/Expense');
const Claim = require('../models/Claim');
const Budget = require('../models/Budget');
const asyncHandler = require('../utils/asyncHandler');
const { sendOk } = require('../utils/apiResponse');
const { sendDownload } = require('../utils/download');
const { round2, percentOf } = require('../utils/money');
const { resolveDateRange, currentPeriod, periodToRange, listMonthlyPeriods } = require('../utils/period');
const budgetService = require('../services/budgetService');
const { CLAIM_STATUS, EXPENSE_STATUS, ROLES } = require('../config/constants');

/**
 * Reports controller (Finance Manager + Admin; employees get their own
 * reimbursement history only).
 *
 * Every report accepts the same filter vocabulary - from, to, department,
 * category, status, employee, search - and appends `?format=csv` or
 * `?format=pdf` to download the filtered result set (spreadsheet friendly CSV
 * or a branded, printable PDF).
 */

/** Default window: the current calendar year (reports are period based). */
const resolveRange = (query) => {
  const range = resolveDateRange({ from: query.from, to: query.to });
  if (range && range.start && range.end) return range;
  if (range && range.start) return { start: range.start, end: new Date() };
  if (range && range.end) {
    return { start: new Date(range.end.getFullYear(), 0, 1), end: range.end };
  }
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start: new Date(end.getFullYear(), 0, 1, 0, 0, 0, 0), end };
};

/**
 * Download metadata per report: CSV / PDF file name prefix, PDF title and the
 * PDF page orientation. The column list itself stays beside each endpoint so
 * both exports always contain exactly the same fields.
 */
const REPORT_DOWNLOADS = {
  expenses: { prefix: 'expenses-report', title: 'Expense report', orientation: 'landscape' },
  claims: {
    prefix: 'claims-report',
    title: 'Reimbursement claim report',
    orientation: 'landscape',
  },
  'approval-summary': { prefix: 'approval-summary', title: 'Approved vs rejected claims' },
  'budget-usage': { prefix: 'budget-usage-report', title: 'Budget usage report', orientation: 'landscape' },
  'monthly-trend': { prefix: 'monthly-trend', title: 'Monthly spending trend' },
  'top-categories': { prefix: 'top-categories', title: 'Top expense categories' },
  'top-vendors': { prefix: 'top-vendors', title: 'Top vendors by approved value' },
  'employee-reimbursements': {
    prefix: 'employee-reimbursements',
    title: 'Employee reimbursement history',
  },
};

/** "2026-01-01 to 2026-09-23" - the window line printed under the PDF title. */
const downloadSubtitle = (start, end) =>
  start && end
    ? `${new Date(start).toISOString().slice(0, 10)} to ${new Date(end).toISOString().slice(0, 10)}`
    : '';

/** Backend side sum of a numeric column, used by the PDF KPI cards. */
const sumRows = (rows, key) =>
  round2(rows.reduce((total, row) => total + Number(row[key] || 0), 0));

/**
 * Export the filtered report when `?format=csv` or `?format=pdf` was asked for.
 * @returns {boolean} true when the download response has already been sent
 */
const sendReportDownload = (req, res, key, options) => {
  const definition = REPORT_DOWNLOADS[key];
  const response = sendDownload(req, res, {
    ...definition,
    meta: [`Records: ${options.rows.length}`, ...(options.meta || [])],
    ...options,
  });
  return Boolean(response);
};

/** Employees are restricted to their own claim data in every report. */
const applyClaimScope = (req, match) => {
  if (req.user.role === ROLES.EMPLOYEE) {
    match.employee = req.user._id;
  } else if (req.query.employee) {
    match.employee = req.query.employee;
  }
  return match;
};

/**
 * @route GET /api/reports/expenses
 * @query from, to, department, category, status, minAmount, maxAmount, search, format
 * @access Admin, Finance Manager
 */
const expenseReport = asyncHandler(async (req, res) => {
  const { start, end } = resolveRange(req.query);
  const match = { date: { $gte: start, $lte: end } };
  if (req.query.department) match.department = req.query.department;
  if (req.query.category) match.category = req.query.category;
  if (req.query.status) match.status = { $in: String(req.query.status).split(',').map((s) => s.trim()) };
  if (req.query.paymentMethod) match.paymentMethod = req.query.paymentMethod;
  if (req.query.minAmount || req.query.maxAmount) {
    match.amount = {};
    if (Number.isFinite(Number(req.query.minAmount))) match.amount.$gte = Number(req.query.minAmount);
    if (Number.isFinite(Number(req.query.maxAmount))) match.amount.$lte = Number(req.query.maxAmount);
  }
  if (req.query.search) {
    const escaped = String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(escaped, 'i');
    match.$or = [{ vendor: pattern }, { description: pattern }, { expenseNo: pattern }];
  }

  const expenses = await Expense.find(match)
    .sort({ date: -1 })
    .limit(5000)
    .populate('department', 'name')
    .populate('category', 'name')
    .lean();

  const rows = expenses.map((expense) => ({
    expenseNo: expense.expenseNo,
    date: expense.date,
    vendor: expense.vendor,
    category: expense.category?.name || expense.categoryName,
    department: expense.department?.name || expense.departmentName,
    description: expense.description,
    amount: round2(expense.amount),
    approvedAmount: round2(expense.approvedAmount || 0),
    paidAmount: round2(expense.paidAmount || 0),
    paymentMethod: expense.paymentMethod,
    recurringLabel: expense.recurringLabel,
    status: expense.status,
  }));

  const totals = rows.reduce(
    (accumulator, row) => ({
      amount: round2(accumulator.amount + row.amount),
      approved: round2(accumulator.approved + row.approvedAmount),
      paid: round2(accumulator.paid + row.paidAmount),
    }),
    { amount: 0, approved: 0, paid: 0 },
  );

  const downloadColumns = [
      { key: 'expenseNo', label: 'Expense No' },
      { key: 'date', label: 'Date' },
      { key: 'vendor', label: 'Vendor' },
      { key: 'category', label: 'Category' },
      { key: 'department', label: 'Department' },
      { key: 'description', label: 'Description' },
      { key: 'amount', label: 'Amount' },
      { key: 'approvedAmount', label: 'Approved' },
      { key: 'paidAmount', label: 'Paid' },
      { key: 'paymentMethod', label: 'Payment Method' },
      { key: 'recurringLabel', label: 'Recurring' },
      { key: 'status', label: 'Status', badge: true },
  ];

  if (
    sendReportDownload(req, res, 'expenses', {
      rows,
      columns: downloadColumns,
      subtitle: downloadSubtitle(start, end),
      bandBadge: 'Internal use',
      stats: [
        { label: 'Records', value: rows.length },
        { label: 'Total value', value: sumRows(rows, 'amount') },
        { label: 'Approved', value: sumRows(rows, 'approvedAmount'), tone: 'info' },
        { label: 'Paid', value: sumRows(rows, 'paidAmount'), tone: 'success' },
      ],
    })
  ) {
    return;
  }

  return sendOk(res, {
    window: { from: start, to: end },
    totals: { ...totals, count: rows.length },
    rows,
  });
});

/**
 * @route GET /api/reports/claims
 * @query from, to, department, category, status, employee, search, format
 * @access Admin, Finance Manager (employees: own claims only)
 */
const claimReport = asyncHandler(async (req, res) => {
  const { start, end } = resolveRange(req.query);
  const match = applyClaimScope(req, { submittedAt: { $gte: start, $lte: end } });
  if (req.query.department) match.department = req.query.department;
  if (req.query.category) match['items.category'] = req.query.category;
  if (req.query.status) match.status = { $in: String(req.query.status).split(',').map((s) => s.trim()) };
  if (req.query.search) {
    const escaped = String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(escaped, 'i');
    match.$or = [{ claimNo: pattern }, { title: pattern }, { employeeName: pattern }];
  }

  const claims = await Claim.find(match)
    .sort({ submittedAt: -1 })
    .limit(5000)
    .populate('employee', 'name email')
    .populate('department', 'name')
    .lean();

  const rows = claims.map((claim) => ({
    claimNo: claim.claimNo,
    employee: claim.employee?.name || claim.employeeName,
    employeeEmail: claim.employee?.email,
    department: claim.department?.name || claim.departmentName,
    title: claim.title,
    submittedAt: claim.submittedAt,
    dueAt: claim.dueAt,
    itemCount: (claim.items || []).length,
    requested: round2(claim.totalRequested),
    approved: round2(claim.totalApproved),
    paid: round2(claim.totalPaid),
    adjusted: round2(claim.totalAdjusted || 0),
    status: claim.status,
    assignedTo: claim.assignedToName,
    overdue:
      claim.status === CLAIM_STATUS.SUBMITTED && claim.dueAt
        ? new Date(claim.dueAt).getTime() < Date.now()
        : false,
  }));

  const totals = rows.reduce(
    (accumulator, row) => ({
      requested: round2(accumulator.requested + row.requested),
      approved: round2(accumulator.approved + row.approved),
      paid: round2(accumulator.paid + row.paid),
    }),
    { requested: 0, approved: 0, paid: 0 },
  );

  const downloadColumns = [
      { key: 'claimNo', label: 'Claim No' },
      { key: 'employee', label: 'Employee' },
      { key: 'department', label: 'Department' },
      { key: 'title', label: 'Title' },
      { key: 'submittedAt', label: 'Submitted' },
      { key: 'itemCount', label: 'Items' },
      { key: 'requested', label: 'Requested' },
      { key: 'approved', label: 'Approved' },
      { key: 'paid', label: 'Paid' },
      { key: 'status', label: 'Status', badge: true },
      { key: 'assignedTo', label: 'Assigned To' },
      { key: 'overdue', label: 'Overdue' },
  ];

  if (
    sendReportDownload(req, res, 'claims', {
      rows,
      columns: downloadColumns,
      subtitle: downloadSubtitle(start, end),
      bandBadge: 'Internal use',
      stats: [
        { label: 'Claims', value: rows.length },
        { label: 'Requested', value: sumRows(rows, 'requested') },
        { label: 'Approved', value: sumRows(rows, 'approved'), tone: 'info' },
        { label: 'Paid', value: sumRows(rows, 'paid'), tone: 'success' },
      ],
    })
  ) {
    return;
  }

  return sendOk(res, {
    window: { from: start, to: end },
    totals: { ...totals, count: rows.length },
    rows,
  });
});

/**
 * @route GET /api/reports/approval-summary
 * Approved versus rejected (and returned, paid) claim totals.
 * @access Admin, Finance Manager
 */
const approvalSummary = asyncHandler(async (req, res) => {
  const { start, end } = resolveRange(req.query);
  const match = applyClaimScope(req, { submittedAt: { $gte: start, $lte: end } });
  if (req.query.department) match.department = req.query.department;

  const grouped = await Claim.aggregate([
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
    { $sort: { _id: 1 } },
  ]);

  const rows = grouped.map((row) => ({
    status: row._id,
    count: row.count,
    requested: round2(row.requested),
    approved: round2(row.approved),
    paid: round2(row.paid),
  }));

  const approvedTotal = rows
    .filter((row) => [CLAIM_STATUS.APPROVED, CLAIM_STATUS.PAID].includes(row.status))
    .reduce((sum, row) => round2(sum + row.approved), 0);
  const rejectedTotal = rows
    .filter((row) => row.status === CLAIM_STATUS.REJECTED)
    .reduce((sum, row) => round2(sum + row.requested), 0);
  const pendingTotal = rows
    .filter((row) => [CLAIM_STATUS.SUBMITTED, CLAIM_STATUS.RETURNED].includes(row.status))
    .reduce((sum, row) => round2(sum + row.requested), 0);

  const payload = {
    window: { from: start, to: end },
    approvedTotal,
    rejectedTotal,
    pendingTotal,
    approvalRate: percentOf(
      approvedTotal,
      approvedTotal + rejectedTotal,
    ),
    rows,
  };

  const downloadColumns = [
      { key: 'status', label: 'Status', badge: true },
      { key: 'count', label: 'Claims' },
      { key: 'requested', label: 'Requested' },
      { key: 'approved', label: 'Approved' },
      { key: 'paid', label: 'Paid' },
  ];

  if (
    sendReportDownload(req, res, 'approval-summary', {
      rows,
      columns: downloadColumns,
      bandBadge: 'Internal use',
      stats: [
        { label: 'Claims', value: sumRows(rows, 'count') },
        { label: 'Requested', value: sumRows(rows, 'requested') },
        { label: 'Approved', value: sumRows(rows, 'approved'), tone: 'info' },
        { label: 'Paid', value: sumRows(rows, 'paid'), tone: 'success' },
      ],
    })
  ) {
    return;
  }

  return sendOk(res, payload);
});

/**
 * @route GET /api/reports/budget-usage
 * @query periodType, period, department, format
 * Budget usage by department and category (allocated / used / committed / remaining).
 * @access Admin, Finance Manager
 */
const budgetUsageReport = asyncHandler(async (req, res) => {
  const periodType = req.query.periodType === 'Yearly' ? 'Yearly' : 'Monthly';
  const period = req.query.period || currentPeriod(periodType);
  const filter = { periodType, period };
  if (req.query.department) filter.department = req.query.department;

  const budgetDocs = await Budget.find(filter)
    .populate('department', 'name')
    .populate('category', 'name')
    .sort({ department: 1 });

  const decorated = await budgetService.decorateBudgets(budgetDocs, { evaluate: true });

  const rows = decorated.map(({ budget, usage }) => ({
    department: budget.department?.name || 'Unknown',
    category: budget.category?.name || 'Unknown',
    period: budget.period,
    periodType: budget.periodType,
    allocated: usage.allocated,
    used: usage.used,
    committed: usage.committed,
    remaining: usage.remaining,
    usagePercent: usage.usagePercent,
    state: usage.isExceeded ? 'Exceeded' : usage.isWarning ? 'Warning' : 'Within budget',
  }));

  const totals = rows.reduce(
    (accumulator, row) => ({
      allocated: round2(accumulator.allocated + row.allocated),
      used: round2(accumulator.used + row.used),
      committed: round2(accumulator.committed + row.committed),
      remaining: round2(accumulator.remaining + row.remaining),
    }),
    { allocated: 0, used: 0, committed: 0, remaining: 0 },
  );

  const downloadColumns = [
      { key: 'department', label: 'Department' },
      { key: 'category', label: 'Category' },
      { key: 'period', label: 'Period' },
      { key: 'periodType', label: 'Period Type' },
      { key: 'allocated', label: 'Allocated' },
      { key: 'used', label: 'Used' },
      { key: 'committed', label: 'Committed' },
      { key: 'remaining', label: 'Remaining' },
      { key: 'usagePercent', label: 'Usage %', bar: true, warningAt: 80 },
      { key: 'state', label: 'State', badge: true },
  ];

  if (
    sendReportDownload(req, res, 'budget-usage', {
      rows,
      columns: downloadColumns,
      subtitle: `${periodType} - ${period}`,
      bandBadge: 'Internal use',
      stats: [
        { label: 'Budgets', value: rows.length },
        { label: 'Allocated', value: sumRows(rows, 'allocated'), tone: 'info' },
        { label: 'Used', value: sumRows(rows, 'used'), tone: 'warning' },
        { label: 'Remaining', value: sumRows(rows, 'remaining'), tone: 'success' },
      ],
    })
  ) {
    return;
  }

  return sendOk(res, {
    period,
    periodType,
    totals: { ...totals, usagePercent: percentOf(totals.used + totals.committed, totals.allocated) },
    rows,
  });
});

/**
 * @route GET /api/reports/monthly-trend
 * Monthly spending trend (direct expenses + approved reimbursements).
 * @access Admin, Finance Manager
 */
const monthlyTrendReport = asyncHandler(async (req, res) => {
  const { start, end } = resolveRange(req.query);
  const deptMatch = req.query.department ? { department: req.query.department } : {};

  const [expenseRows, claimRows] = await Promise.all([
    Expense.aggregate([
      {
        $match: {
          date: { $gte: start, $lte: end },
          status: { $in: [EXPENSE_STATUS.APPROVED, EXPENSE_STATUS.PAID] },
          ...deptMatch,
        },
      },
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
      {
        $match: {
          submittedAt: { $gte: start, $lte: end },
          status: { $in: [CLAIM_STATUS.APPROVED, CLAIM_STATUS.PAID] },
          ...deptMatch,
        },
      },
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

  const expenseMap = new Map(
    expenseRows.map((row) => [`${row._id.y}-${String(row._id.m).padStart(2, '0')}`, row]),
  );
  const claimMap = new Map(
    claimRows.map((row) => [`${row._id.y}-${String(row._id.m).padStart(2, '0')}`, row]),
  );

  const rows = listMonthlyPeriods(start, end).map(({ period, label }) => {
    const direct = expenseMap.get(period);
    const claims = claimMap.get(period);
    const directAmount = round2(direct?.amount || 0);
    const claimAmount = round2(claims?.amount || 0);
    return {
      period,
      month: label,
      directExpenses: directAmount,
      reimbursements: claimAmount,
      total: round2(directAmount + claimAmount),
      directCount: direct?.count || 0,
      claimItemCount: claims?.count || 0,
    };
  });

  const downloadColumns = [
      { key: 'period', label: 'Period' },
      { key: 'month', label: 'Month' },
      { key: 'directExpenses', label: 'Direct Expenses' },
      { key: 'reimbursements', label: 'Reimbursements' },
      { key: 'total', label: 'Total' },
      { key: 'directCount', label: 'Expense Records' },
      { key: 'claimItemCount', label: 'Claim Items' },
  ];

  if (
    sendReportDownload(req, res, 'monthly-trend', {
      rows,
      columns: downloadColumns,
      subtitle: downloadSubtitle(start, end),
      bandBadge: 'Internal use',
      stats: [
        { label: 'Direct expenses', value: sumRows(rows, 'directExpenses'), tone: 'info' },
        { label: 'Reimbursements', value: sumRows(rows, 'reimbursements'), tone: 'success' },
        { label: 'Combined total', value: sumRows(rows, 'total') },
        { label: 'Claim items', value: sumRows(rows, 'claimItemCount') },
      ],
    })
  ) {
    return;
  }

  return sendOk(res, { window: { from: start, to: end }, rows });
});

/**
 * @route GET /api/reports/top-categories
 * Top expense categories across direct expenses and claim items.
 * @access Admin, Finance Manager
 */
const topCategoriesReport = asyncHandler(async (req, res) => {
  const { start, end } = resolveRange(req.query);
  const deptMatch = req.query.department ? { department: req.query.department } : {};
  const limit = Math.min(Number(req.query.limit) || 10, 50);

  const [direct, claims] = await Promise.all([
    Expense.aggregate([
      {
        $match: {
          date: { $gte: start, $lte: end },
          status: { $in: [EXPENSE_STATUS.APPROVED, EXPENSE_STATUS.PAID] },
          ...deptMatch,
        },
      },
      {
        $group: {
          _id: '$categoryName',
          amount: {
            $sum: { $cond: [{ $gt: ['$approvedAmount', 0] }, '$approvedAmount', '$amount'] },
          },
          count: { $sum: 1 },
        },
      },
    ]),
    Claim.aggregate([
      {
        $match: {
          submittedAt: { $gte: start, $lte: end },
          status: { $in: [CLAIM_STATUS.APPROVED, CLAIM_STATUS.PAID] },
          ...deptMatch,
        },
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.categoryName',
          amount: { $sum: '$items.approvedAmount' },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const merged = new Map();
  const add = (rows, source) => {
    rows.forEach((row) => {
      const key = row._id || 'Uncategorised';
      const bucket = merged.get(key) || { category: key, directExpenses: 0, reimbursements: 0, count: 0 };
      bucket[source] = round2(bucket[source] + row.amount);
      bucket.count += row.count;
      merged.set(key, bucket);
    });
  };
  add(direct, 'directExpenses');
  add(claims, 'reimbursements');

  const rows = [...merged.values()]
    .map((row) => ({ ...row, total: round2(row.directExpenses + row.reimbursements) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);

  const downloadColumns = [
      { key: 'category', label: 'Category' },
      { key: 'directExpenses', label: 'Direct Expenses' },
      { key: 'reimbursements', label: 'Reimbursements' },
      { key: 'total', label: 'Total' },
      { key: 'count', label: 'Records' },
  ];

  if (
    sendReportDownload(req, res, 'top-categories', {
      rows,
      columns: downloadColumns,
      subtitle: downloadSubtitle(start, end),
      bandBadge: 'Internal use',
      stats: [
        { label: 'Categories', value: rows.length },
        { label: 'Direct expenses', value: sumRows(rows, 'directExpenses'), tone: 'info' },
        { label: 'Reimbursements', value: sumRows(rows, 'reimbursements'), tone: 'success' },
        { label: 'Total', value: sumRows(rows, 'total') },
      ],
    })
  ) {
    return;
  }

  return sendOk(res, { window: { from: start, to: end }, rows });
});

/**
 * @route GET /api/reports/top-vendors
 * Top vendors by approved direct expense value.
 * @access Admin, Finance Manager
 */
const topVendorsReport = asyncHandler(async (req, res) => {
  const { start, end } = resolveRange(req.query);
  const limit = Math.min(Number(req.query.limit) || 10, 50);
  const match = {
    date: { $gte: start, $lte: end },
    status: { $in: [EXPENSE_STATUS.APPROVED, EXPENSE_STATUS.PAID] },
  };
  if (req.query.department) match.department = req.query.department;

  const grouped = await Expense.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$vendor',
        total: {
          $sum: { $cond: [{ $gt: ['$approvedAmount', 0] }, '$approvedAmount', '$amount'] },
        },
        count: { $sum: 1 },
        lastExpenseDate: { $max: '$date' },
      },
    },
    { $sort: { total: -1 } },
    { $limit: limit },
  ]);

  const rows = grouped.map((row) => ({
    vendor: row._id || 'Unknown vendor',
    total: round2(row.total),
    count: row.count,
    lastExpenseDate: row.lastExpenseDate,
  }));

  const downloadColumns = [
      { key: 'vendor', label: 'Vendor' },
      { key: 'total', label: 'Total Approved' },
      { key: 'count', label: 'Expenses' },
      { key: 'lastExpenseDate', label: 'Last Expense' },
  ];

  if (
    sendReportDownload(req, res, 'top-vendors', {
      rows,
      columns: downloadColumns,
      subtitle: downloadSubtitle(start, end),
      bandBadge: 'Internal use',
      stats: [
        { label: 'Vendors', value: rows.length },
        { label: 'Total approved', value: sumRows(rows, 'total'), tone: 'info' },
        { label: 'Expenses', value: sumRows(rows, 'count') },
      ],
    })
  ) {
    return;
  }

  return sendOk(res, { window: { from: start, to: end }, rows });
});

/**
 * @route GET /api/reports/employee-reimbursements
 * Reimbursement history per employee (employees: their own history only).
 * @access Admin, Finance Manager, Employee (self)
 */
const employeeReimbursementReport = asyncHandler(async (req, res) => {
  const { start, end } = resolveRange(req.query);
  const match = applyClaimScope(req, { submittedAt: { $gte: start, $lte: end } });
  if (req.query.department) match.department = req.query.department;

  const grouped = await Claim.aggregate([
    { $match: match },
    {
      $group: {
        _id: { employee: '$employee', name: '$employeeName', department: '$departmentName' },
        claims: { $sum: 1 },
        requested: { $sum: '$totalRequested' },
        approved: { $sum: '$totalApproved' },
        paid: { $sum: '$totalPaid' },
        rejected: {
          $sum: { $cond: [{ $eq: ['$status', CLAIM_STATUS.REJECTED] }, 1, 0] },
        },
        pending: {
          $sum: {
            $cond: [{ $in: ['$status', [CLAIM_STATUS.SUBMITTED, CLAIM_STATUS.RETURNED]] }, 1, 0],
          },
        },
      },
    },
    { $sort: { paid: -1 } },
  ]);

  const rows = grouped.map((row) => ({
    employee: row._id.name || 'Unknown employee',
    department: row._id.department || 'Unassigned',
    claims: row.claims,
    requested: round2(row.requested),
    approved: round2(row.approved),
    paid: round2(row.paid),
    outstanding: round2(row.approved - row.paid),
    rejectedClaims: row.rejected,
    pendingClaims: row.pending,
  }));

  const totals = rows.reduce(
    (accumulator, row) => ({
      requested: round2(accumulator.requested + row.requested),
      approved: round2(accumulator.approved + row.approved),
      paid: round2(accumulator.paid + row.paid),
      outstanding: round2(accumulator.outstanding + row.outstanding),
    }),
    { requested: 0, approved: 0, paid: 0, outstanding: 0 },
  );

  const downloadColumns = [
      { key: 'employee', label: 'Employee' },
      { key: 'department', label: 'Department' },
      { key: 'claims', label: 'Claims' },
      { key: 'requested', label: 'Requested' },
      { key: 'approved', label: 'Approved' },
      { key: 'paid', label: 'Paid' },
      { key: 'outstanding', label: 'Outstanding' },
      { key: 'rejectedClaims', label: 'Rejected Claims' },
      { key: 'pendingClaims', label: 'Pending Claims' },
  ];

  if (
    sendReportDownload(req, res, 'employee-reimbursements', {
      rows,
      columns: downloadColumns,
      totals: { ...totals, employee: 'TOTAL' },
      subtitle: downloadSubtitle(start, end),
      bandBadge: 'Internal use',
      stats: [
        { label: 'Employees', value: rows.length },
        { label: 'Approved', value: totals.approved, tone: 'info' },
        { label: 'Paid', value: totals.paid, tone: 'success' },
        { label: 'Outstanding', value: totals.outstanding, tone: 'warning' },
      ],
    })
  ) {
    return;
  }

  return sendOk(res, { window: { from: start, to: end }, totals, rows });
});

module.exports = {
  expenseReport,
  claimReport,
  approvalSummary,
  budgetUsageReport,
  monthlyTrendReport,
  topCategoriesReport,
  topVendorsReport,
  employeeReimbursementReport,
};

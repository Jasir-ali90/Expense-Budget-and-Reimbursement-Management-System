const mongoose = require('mongoose');
const Expense = require('../models/Expense');
const Category = require('../models/Category');
const Department = require('../models/Department');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendOk, sendCreated, sendMessage, sendPaginated } = require('../utils/apiResponse');
const { sendDownload, resolveDownloadFormat } = require('../utils/download');
const { buildListQuery } = require('../utils/queryBuilder');
const {
  requireObjectId,
  requireEnum,
  requireString,
  optionalString,
  requireAmount,
  requireDate,
  toBoolean,
  parseEnum,
} = require('../utils/validate');
const { round2 } = require('../utils/money');
const auditService = require('../services/auditService');
const notificationService = require('../services/notificationService');
const counterService = require('../services/counterService');
const {
  EXPENSE_STATUS,
  EXPENSE_STATUS_VALUES,
  PAYMENT_METHODS,
  RECURRING_LABELS,
  AUDIT_ACTIONS,
  ENTITY_TYPES,
  NOTIFICATION_TYPES,
  ROLES,
} = require('../config/constants');
const { toStoredFile, removeUploadedFile } = require('../middleware/upload');

/**
 * Direct company expenses (Finance).
 * Invariants:
 *   - Draft expenses are editable; once submitted they are read-only.
 *   - Paid expenses can never be edited or deleted - adjustments only.
 *   - Approved/paid totals always come from the backend.
 */

/** Shared validation + category/department existence checks. */
const resolveExpenseInput = async (body) => {
  const date = requireDate(body, 'date', { label: 'Expense date' });
  const vendor = requireString(body, 'vendor', { max: 150, label: 'Vendor' });
  const categoryId = requireObjectId(body, 'category', { label: 'Category' });
  const departmentId = requireObjectId(body, 'department', { label: 'Department' });
  const description = requireString(body, 'description', { max: 500, label: 'Description' });
  const amount = requireAmount(body, 'amount', { label: 'Amount' });
  const paymentMethod = requireEnum(body, 'paymentMethod', PAYMENT_METHODS, {
    label: 'Payment method',
  });
  const recurringLabel = parseEnum(body.recurringLabel, RECURRING_LABELS, 'Recurring label') || 'None';

  const [category, department] = await Promise.all([
    Category.findById(categoryId),
    Department.findById(departmentId),
  ]);
  if (!category) throw ApiError.badRequest('Category does not exist');
  if (!department) throw ApiError.badRequest('Department does not exist');
  if (category.isArchived) {
    throw ApiError.unprocessable(
      `The ${category.name} category is archived and cannot be used for new expenses`,
    );
  }

  return {
    date,
    vendor,
    category,
    department,
    description,
    amount,
    paymentMethod,
    recurringLabel,
    snapshot: {
      category: category._id,
      categoryName: category.name,
      department: department._id,
      departmentName: department.name,
    },
  };
};

/** Reject updates to submitted/approved/paid expenses. */
const assertExpenseEditable = (expense) => {
  if (expense.status === EXPENSE_STATUS.PAID) {
    throw ApiError.badRequest('Paid expenses cannot be edited. Create an adjustment instead.');
  }
  if (expense.status !== EXPENSE_STATUS.DRAFT) {
    throw ApiError.badRequest(
      'Only draft expenses can be edited. Submit it for review or create an adjustment.',
    );
  }
};

/** Hard cap on how many rows a single export may contain. */
const EXPORT_LIMIT = 5000;

/** Columns shared by the CSV and the PDF export of the expense list. */
const EXPENSE_EXPORT_COLUMNS = [
  { key: 'expenseNo', label: 'Expense No' },
  { key: 'date', label: 'Date' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'category', label: 'Category' },
  { key: 'department', label: 'Department' },
  { key: 'description', label: 'Description' },
  { key: 'amount', label: 'Amount', numeric: true },
  { key: 'approvedAmount', label: 'Approved', numeric: true },
  { key: 'paidAmount', label: 'Paid', numeric: true },
  { key: 'paymentMethod', label: 'Payment Method' },
  { key: 'recurringLabel', label: 'Recurring' },
  { key: 'receipt', label: 'Receipt' },
  { key: 'status', label: 'Status', badge: true },
];

/** Flatten an expense document into the export row shape. */
const buildExpenseExportRows = (expenses) =>
  expenses.map((expense) => ({
    expenseNo: expense.expenseNo,
    date: expense.date,
    vendor: expense.vendor,
    category: expense.categoryName || '—',
    department: expense.departmentName || '—',
    description: expense.description,
    amount: round2(expense.amount),
    approvedAmount: round2(expense.approvedAmount),
    paidAmount: round2(expense.paidAmount),
    paymentMethod: expense.paymentMethod,
    recurringLabel: expense.recurringLabel,
    receipt: expense.receipt ? 'Attached' : 'None',
    status: expense.status,
  }));

/** Backend calculated totals for the export (never computed in the browser). */
const buildExpenseExportTotals = (rows) => ({
  expenseNo: `TOTAL (${rows.length})`,
  amount: round2(rows.reduce((sum, row) => sum + Number(row.amount || 0), 0)),
  approvedAmount: round2(rows.reduce((sum, row) => sum + Number(row.approvedAmount || 0), 0)),
  paidAmount: round2(rows.reduce((sum, row) => sum + Number(row.paidAmount || 0), 0)),
});

/** Short, human readable summary of the filters that produced the export. */
const describeExpenseFilters = (query = {}) => {
  const parts = [];
  if (query.status) parts.push(`Status: ${query.status}`);
  if (query.from || query.to) {
    parts.push(`Window: ${query.from || 'start'} to ${query.to || 'today'}`);
  }
  if (query.search) parts.push(`Search: "${query.search}"`);
  return parts.join(' - ') || 'All expense records';
};

/**
 * @route GET /api/expenses
 * @query search, status, department, category, paymentMethod, from, to,
 *        minAmount, maxAmount, page, limit, sort, format (csv|pdf)
 * @access Admin, Finance Manager
 */
const listExpenses = asyncHandler(async (req, res) => {
  const { filter, sort, skip, limit, page } = buildListQuery(req.query, {
    searchFields: ['vendor', 'description', 'expenseNo', 'departmentName', 'categoryName'],
    filters: [
      { field: 'status', type: 'string' },
      { field: 'department', type: 'objectId' },
      { field: 'category', type: 'objectId' },
      { field: 'paymentMethod', type: 'string' },
      { field: 'recurringLabel', type: 'string' },
    ],
    dateField: 'date',
    amountField: 'amount',
    sortableFields: ['date', 'amount', 'vendor', 'createdAt', 'status'],
    defaultSort: { date: -1 },
  });

  const [expenses, total] = await Promise.all([
    Expense.find(filter).sort(sort).skip(skip).limit(limit),
    Expense.countDocuments(filter),
  ]);

  // ?format=csv|pdf exports every matching record (not just the current page).
  if (resolveDownloadFormat(req)) {
    const exported = await Expense.find(filter).sort(sort).limit(EXPORT_LIMIT);
    const rows = buildExpenseExportRows(exported);
    const totals = buildExpenseExportTotals(rows);
    const download = sendDownload(req, res, {
      prefix: 'expenses',
      title: 'Company expense report',
      subtitle: describeExpenseFilters(req.query),
      orientation: 'landscape',
      columns: EXPENSE_EXPORT_COLUMNS,
      rows,
      totals,
      stats: [
        { label: 'Records', value: rows.length },
        { label: 'Total value', value: totals.amount },
        { label: 'Approved', value: totals.approvedAmount, tone: 'info' },
        { label: 'Paid', value: totals.paidAmount, tone: 'success' },
      ],
      bandBadge: 'Internal use',
      watermark: 'INTERNAL USE',
      footerNote: 'Generated from the Expenses screen of the local demo build.',
      meta: [`Records: ${rows.length}`, 'Downloaded through the authenticated API'],
    });
    if (download) return download;
  }

  sendPaginated(res, expenses, { page, limit, total });
});

/**
 * @route GET /api/expenses/:id
 * @access Admin, Finance Manager
 */
const getExpense = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('Invalid expense id');

  const expense = await Expense.findById(id);
  if (!expense) throw ApiError.notFound('Expense not found');

  sendOk(res, { expense });
});

/**
 * @route POST /api/expenses
 * @access Finance Manager, Admin
 * multipart/form-data - optional "receipt" file field.
 */
const createExpense = asyncHandler(async (req, res) => {
  const input = await resolveExpenseInput(req.body);
  const status = parseEnum(req.body.status, [EXPENSE_STATUS.DRAFT, EXPENSE_STATUS.SUBMITTED], 'Status') || EXPENSE_STATUS.DRAFT;

  // Backend receipt rule: a category that requires a receipt cannot be
  // submitted without one - neither at create time nor via the submit route.
  if (status === EXPENSE_STATUS.SUBMITTED && input.category?.requiresReceipt && !req.file) {
    throw ApiError.unprocessable(
      `The ${input.category.name} category requires a receipt before the expense can be submitted`,
    );
  }

  const expense = await Expense.create({
    expenseNo: await counterService.nextExpenseNumber(),
    ...input.snapshot,
    date: input.date,
    vendor: input.vendor,
    description: input.description,
    amount: input.amount,
    approvedAmount: status === EXPENSE_STATUS.SUBMITTED ? 0 : input.amount,
    paymentMethod: input.paymentMethod,
    recurringLabel: input.recurringLabel,
    status,
    receipt: toStoredFile(req.file),
    submittedAt: status === EXPENSE_STATUS.SUBMITTED ? new Date() : undefined,
    createdBy: req.user._id,
    history: [
      {
        action: status === EXPENSE_STATUS.SUBMITTED ? 'Submitted' : 'Draft created',
        by: req.user._id,
      },
    ],
  });

  await auditService.recordFromRequest(req, {
    entityType: ENTITY_TYPES.EXPENSE,
    entityId: expense._id,
    entityLabel: expense.expenseNo,
    action: AUDIT_ACTIONS.CREATE,
    description: `Expense ${expense.expenseNo} created (${input.amount} - ${input.vendor})`,
    after: { amount: input.amount, status },
  });

  sendCreated(res, { expense }, 'Expense created successfully');
});

/**
 * @route PUT /api/expenses/:id
 * @access Finance Manager, Admin
 * Draft-only. Uploaded receipts cannot be removed silently - re-upload replaces.
 */
const updateExpense = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('Invalid expense id');

  const expense = await Expense.findById(id);
  if (!expense) throw ApiError.notFound('Expense not found');
  assertExpenseEditable(expense);

  const input = await resolveExpenseInput(req.body);
  const before = { amount: expense.amount, status: expense.status };

  expense.set({
    ...input.snapshot,
    date: input.date,
    vendor: input.vendor,
    description: input.description,
    amount: input.amount,
    approvedAmount: expense.status === EXPENSE_STATUS.SUBMITTED ? expense.approvedAmount : input.amount,
    paymentMethod: input.paymentMethod,
    recurringLabel: input.recurringLabel,
  });

  if (req.file) {
    const previous = expense.receipt?.fileName;
    expense.receipt = toStoredFile(req.file);
    await removeUploadedFile(previous);
  }

  expense.history.push({ action: 'Draft updated', by: req.user._id });
  await expense.save();

  await auditService.recordFromRequest(req, {
    entityType: ENTITY_TYPES.EXPENSE,
    entityId: expense._id,
    entityLabel: expense.expenseNo,
    action: AUDIT_ACTIONS.UPDATE,
    description: `Draft expense ${expense.expenseNo} updated`,
    before,
    after: { amount: expense.amount, status: expense.status },
  });

  sendOk(res, { expense }, 'Expense updated successfully');
});

/**
 * @route PATCH /api/expenses/:id/submit
 * @access Finance Manager, Admin
 */
const submitExpense = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('Invalid expense id');

  const expense = await Expense.findById(id);
  if (!expense) throw ApiError.notFound('Expense not found');
  assertExpenseEditable(expense);

  const category = await Category.findById(expense.category);
  if (category?.requiresReceipt && !expense.receipt?.fileName) {
    throw ApiError.unprocessable(
      `The ${category.name} category requires a receipt before the expense can be submitted`,
    );
  }

  expense.status = EXPENSE_STATUS.SUBMITTED;
  expense.approvedAmount = 0;
  expense.submittedAt = new Date();
  expense.history.push({ action: 'Submitted', by: req.user._id });
  await expense.save();

  await auditService.recordFromRequest(req, {
    entityType: ENTITY_TYPES.EXPENSE,
    entityId: expense._id,
    entityLabel: expense.expenseNo,
    action: AUDIT_ACTIONS.SUBMIT,
    description: `Expense ${expense.expenseNo} submitted for approval`,
    before: { status: EXPENSE_STATUS.DRAFT },
    after: { status: EXPENSE_STATUS.SUBMITTED },
  });

  await notificationService.notifyFinance({
    departmentId: expense.department,
    type: NOTIFICATION_TYPES.EXPENSE_SUBMITTED,
    title: 'Expense awaiting approval',
    message: `Expense ${expense.expenseNo} (${expense.vendor}) is awaiting approval.`,
    link: `/expenses?search=${expense.expenseNo}`,
    entityType: ENTITY_TYPES.EXPENSE,
    entityId: expense._id,
  });

  sendOk(res, { expense }, 'Expense submitted for approval');
});

/**
 * @route PATCH /api/expenses/:id/approve
 * @body { approvedAmount?, comment? }
 * @access Finance Manager, Admin
 * Supports full or partial approval; never more than the requested amount.
 */
const approveExpense = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('Invalid expense id');

  const expense = await Expense.findById(id);
  if (!expense) throw ApiError.notFound('Expense not found');
  if (expense.status !== EXPENSE_STATUS.SUBMITTED) {
    throw ApiError.badRequest('Only submitted expenses can be approved');
  }

  const requested = round2(expense.amount);
  let approvedAmount = requested;
  if (req.body.approvedAmount !== undefined && req.body.approvedAmount !== null && req.body.approvedAmount !== '') {
    approvedAmount = requireAmount(req.body, 'approvedAmount', { label: 'Approved amount' });
    if (approvedAmount > requested) {
      throw ApiError.badRequest('The approved amount cannot exceed the requested amount');
    }
  }

  expense.status = EXPENSE_STATUS.APPROVED;
  expense.approvedAmount = approvedAmount;
  expense.approvedBy = req.user._id;
  expense.approvedAt = new Date();
  expense.history.push({
    action: approvedAmount < requested ? `Partially approved (${approvedAmount})` : 'Approved',
    by: req.user._id,
    comment: optionalString(req.body, 'comment', { max: 500 }),
  });
  await expense.save();

  await auditService.recordFromRequest(req, {
    entityType: ENTITY_TYPES.EXPENSE,
    entityId: expense._id,
    entityLabel: expense.expenseNo,
    action: approvedAmount < requested ? AUDIT_ACTIONS.PARTIAL_APPROVE : AUDIT_ACTIONS.APPROVE,
    description: `Expense ${expense.expenseNo} approved (${approvedAmount} of ${requested})`,
    before: { status: EXPENSE_STATUS.SUBMITTED },
    after: { status: EXPENSE_STATUS.APPROVED, approvedAmount },
  });

  sendOk(res, { expense }, 'Expense approved');
});

/**
 * @route PATCH /api/expenses/:id/reject
 * @body { reason }
 * @access Finance Manager, Admin
 */
const rejectExpense = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('Invalid expense id');

  const reason = requireString(req.body, 'reason', { max: 500, label: 'Rejection reason' });

  const expense = await Expense.findById(id);
  if (!expense) throw ApiError.notFound('Expense not found');
  if (expense.status !== EXPENSE_STATUS.SUBMITTED) {
    throw ApiError.badRequest('Only submitted expenses can be rejected');
  }

  expense.status = EXPENSE_STATUS.REJECTED;
  expense.approvedAmount = 0;
  expense.rejectionReason = reason;
  expense.rejectedBy = req.user._id;
  expense.rejectedAt = new Date();
  expense.history.push({ action: 'Rejected', by: req.user._id, comment: reason });
  await expense.save();

  await auditService.recordFromRequest(req, {
    entityType: ENTITY_TYPES.EXPENSE,
    entityId: expense._id,
    entityLabel: expense.expenseNo,
    action: AUDIT_ACTIONS.REJECT,
    description: `Expense ${expense.expenseNo} rejected`,
    reason,
    before: { status: EXPENSE_STATUS.SUBMITTED },
    after: { status: EXPENSE_STATUS.REJECTED },
  });

  sendOk(res, { expense }, 'Expense rejected');
});

/**
 * @route PATCH /api/expenses/:id/pay
 * @body { paymentDate?, paymentMethod, transactionReference? }
 * @access Finance Manager, Admin
 * Only approved expenses can be paid, always at the approved amount.
 */
const payExpense = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('Invalid expense id');

  const paymentMethod = requireEnum(req.body, 'paymentMethod', PAYMENT_METHODS, {
    label: 'Payment method',
  });
  const transactionReference = optionalString(req.body, 'transactionReference', { max: 100 });
  const paymentDate = req.body.paymentDate
    ? requireDate(req.body, 'paymentDate', { label: 'Payment date', allowFuture: true })
    : new Date();

  const expense = await Expense.findById(id);
  if (!expense) throw ApiError.notFound('Expense not found');
  if (expense.status !== EXPENSE_STATUS.APPROVED) {
    throw ApiError.badRequest('Only approved expenses can be marked as paid');
  }

  const paidAmount = round2(expense.approvedAmount || expense.amount);

  expense.status = EXPENSE_STATUS.PAID;
  expense.paidAmount = paidAmount;
  expense.paidBy = req.user._id;
  expense.paymentMethod = paymentMethod;
  expense.paymentReference = transactionReference || expense.expenseNo;
  expense.history.push({
    action: `Paid (${paidAmount} via ${paymentMethod})`,
    by: req.user._id,
  });
  await expense.save();

  await auditService.recordFromRequest(req, {
    entityType: ENTITY_TYPES.EXPENSE,
    entityId: expense._id,
    entityLabel: expense.expenseNo,
    action: AUDIT_ACTIONS.PAY,
    description: `Expense ${expense.expenseNo} paid (${paidAmount})`,
    before: { status: EXPENSE_STATUS.APPROVED },
    after: { status: EXPENSE_STATUS.PAID, paidAmount },
  });

  await notificationService.notifyFinance({
    departmentId: expense.department,
    type: NOTIFICATION_TYPES.EXPENSE_PAID,
    title: 'Expense marked as paid',
    message: `Expense ${expense.expenseNo} was paid (${paidAmount}).`,
    link: `/expenses?search=${expense.expenseNo}`,
    entityType: ENTITY_TYPES.EXPENSE,
    entityId: expense._id,
  });

  sendOk(res, { expense }, 'Expense marked as paid');
});

/**
 * @route POST /api/expenses/:id/adjustments
 * @body { amount (positive or negative), reason, date? }
 * @access Finance Manager, Admin
 * Paid records are immutable - corrections are appended as adjustment entries.
 */
const createAdjustment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('Invalid expense id');

  const reason = requireString(req.body, 'reason', { max: 300, label: 'Adjustment reason' });
  const amount = requireAmount(req.body, 'amount', {
    min: -10000000,
    label: 'Adjustment amount',
  });
  if (amount === 0) throw ApiError.badRequest('The adjustment amount cannot be zero');
  const date = req.body.date
    ? requireDate(req.body, 'date', { label: 'Adjustment date', allowFuture: true })
    : new Date();

  const expense = await Expense.findById(id);
  if (!expense) throw ApiError.notFound('Expense not found');
  if (expense.status !== EXPENSE_STATUS.PAID) {
    throw ApiError.badRequest('Adjustments can only be added to paid expenses');
  }

  const newPaidTotal = round2(expense.paidAmount + amount);
  if (newPaidTotal < 0) {
    throw ApiError.unprocessable(
      `The adjustment would make the paid total negative (current paid: ${expense.paidAmount})`,
    );
  }

  expense.adjustments.push({
    type: amount > 0 ? 'Add' : 'Deduct',
    amount: round2(Math.abs(amount)),
    reason,
    createdBy: req.user._id,
    date,
  });
  expense.paidAmount = newPaidTotal;
  expense.history.push({
    action: `Adjustment ${amount > 0 ? '+' : '-'}${round2(Math.abs(amount))}`,
    by: req.user._id,
    comment: reason,
  });
  await expense.save();

  await auditService.recordFromRequest(req, {
    entityType: ENTITY_TYPES.EXPENSE,
    entityId: expense._id,
    entityLabel: expense.expenseNo,
    action: AUDIT_ACTIONS.ADJUST,
    description: `Adjustment ${amount} applied to expense ${expense.expenseNo}`,
    reason,
    before: { paidAmount: round2(newPaidTotal - amount) },
    after: { paidAmount: newPaidTotal },
  });

  sendOk(res, { expense }, 'Adjustment recorded');
});

/**
 * @route DELETE /api/expenses/:id
 * @access Finance Manager, Admin
 * Draft-only delete; anything else is preserved for the audit trail.
 */
const deleteExpense = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('Invalid expense id');

  const expense = await Expense.findById(id);
  if (!expense) throw ApiError.notFound('Expense not found');
  if (expense.status !== EXPENSE_STATUS.DRAFT) {
    throw ApiError.badRequest(
      'Only draft expenses can be deleted. Submitted and paid records are kept for the audit trail.',
    );
  }

  await removeUploadedFile(expense.receipt?.fileName);
  await expense.deleteOne();

  await auditService.recordFromRequest(req, {
    entityType: ENTITY_TYPES.EXPENSE,
    entityId: id,
    entityLabel: expense.expenseNo,
    action: AUDIT_ACTIONS.DELETE,
    description: `Draft expense ${expense.expenseNo} deleted`,
    before: { amount: expense.amount, status: expense.status },
  });

  sendMessage(res, 'Draft expense deleted');
});

module.exports = {
  listExpenses,
  getExpense,
  createExpense,
  updateExpense,
  submitExpense,
  approveExpense,
  rejectExpense,
  payExpense,
  createAdjustment,
  deleteExpense,
};


const mongoose = require('mongoose');
const Claim = require('../models/Claim');
const Category = require('../models/Category');
const Department = require('../models/Department');
const User = require('../models/User');
const Setting = require('../models/Setting');
const ApiError = require('../utils/ApiError');
const { round2 } = require('../utils/money');
const counterService = require('./counterService');
const notificationService = require('./notificationService');
const auditService = require('./auditService');
const {
  CLAIM_STATUS,
  ITEM_STATUS,
  REVIEW_ACTION,
  NOTIFICATION_TYPES,
  AUDIT_ACTIONS,
  ENTITY_TYPES,
  PAYMENT_METHODS,
} = require('../config/constants');

/**
 * Claim workflow service.
 *
 * Every rule from the brief is enforced here, on the backend:
 *   - receipt requirements and per category claim limits
 *   - Draft -> Submitted -> Returned/Approved/Rejected/Paid transitions
 *   - routing to the department's Finance Manager with an SLA due date
 *   - self-approval is impossible
 *   - reject / return / reassign / receipt requests require a comment
 *   - item level partial approvals with server-side totals
 *   - payments only against approved amounts; adjustments are append-only
 */

/** Load the singleton settings document (created on demand). */
const getSettings = () => Setting.getSettings();

const pushTimeline = (claim, { action, actor, comment, previousStatus, newStatus, meta }) => {
  claim.timeline.push({
    action,
    actor: actor?._id || undefined,
    actorName: actor?.name || 'System',
    actorRole: actor?.role || 'System',
    comment: comment || undefined,
    previousStatus: previousStatus || claim.status,
    newStatus: newStatus || claim.status,
    meta,
    timestamp: new Date(),
  });
};

/**
 * Validate + normalise claim items against their categories.
 *
 * @param {Array} rawItems payload items (category ids, amounts, receipts)
 * @param {Object} options
 * @param {boolean} options.enforceReceipts when true, missing receipts on
 *   receipt-required categories fail (submission); drafts are allowed through
 * @returns {Promise<Array>} cleaned items matching the Claim item schema
 */
const validateClaimItems = async (rawItems, { enforceReceipts = false } = {}) => {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw ApiError.badRequest('A claim must contain at least one expense item');
  }
  if (rawItems.length > 50) {
    throw ApiError.badRequest('A claim cannot contain more than 50 items');
  }

  const categoryIds = [...new Set(rawItems.map((item) => String(item.category || '')))];
  if (categoryIds.some((id) => !mongoose.isValidObjectId(id))) {
    throw ApiError.badRequest('One or more items have an invalid category');
  }

  const categories = await Category.find({ _id: { $in: categoryIds } });
  const categoryMap = new Map(categories.map((category) => [String(category._id), category]));

  const cleaned = [];
  for (const [index, raw] of rawItems.entries()) {
    const category = categoryMap.get(String(raw.category || ''));
    if (!category) {
      throw ApiError.badRequest(`Item ${index + 1}: category does not exist`);
    }
    if (category.isArchived) {
      throw ApiError.badRequest(
        `Item ${index + 1}: the category "${category.name}" is archived and cannot be used in new claims`,
      );
    }

    const amount = round2(Number(raw.requestedAmount));
    if (!Number.isFinite(amount) || amount < 0.01) {
      throw ApiError.badRequest(`Item ${index + 1}: requested amount must be a positive number`);
    }
    if (category.hasClaimLimit && amount > category.maxClaimAmount) {
      throw ApiError.badRequest(
        `Item ${index + 1}: the category "${category.name}" allows a maximum of ${category.maxClaimAmount} per item`,
      );
    }

    const date = new Date(raw.date);
    if (Number.isNaN(date.getTime())) {
      throw ApiError.badRequest(`Item ${index + 1}: a valid date is required`);
    }
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    if (date > todayEnd) {
      throw ApiError.badRequest(`Item ${index + 1}: the date cannot be in the future`);
    }

    const description = String(raw.description || '').trim();
    if (!description) {
      throw ApiError.badRequest(`Item ${index + 1}: a description is required`);
    }
    if (description.length > 500) {
      throw ApiError.badRequest(`Item ${index + 1}: the description is too long (max 500 characters)`);
    }

    const receipt = raw.receipt || null;
    if (enforceReceipts && category.requiresReceipt && !receipt) {
      throw ApiError.badRequest(
        `Item ${index + 1}: the category "${category.name}" requires a receipt`,
      );
    }

    cleaned.push({
      // Preserve the subdocument id when the item already exists so that item
      // identity is stable across edits, submit and re-validation. Finance
      // partial approvals and receipt uploads reference items by this id.
      ...(raw._id && mongoose.isValidObjectId(String(raw._id)) ? { _id: raw._id } : {}),
      date,
      category: category._id,
      categoryName: category.name,
      description,
      merchant: String(raw.merchant || '').trim() || undefined,
      requestedAmount: amount,
      approvedAmount: 0,
      status: ITEM_STATUS.PENDING,
      receipt,
    });
  }

  return cleaned;
};

/**
 * Create a claim as a Draft.
 * @param {Object} params
 * @param {Object} params.employee owning user document
 * @param {Object} params.payload { title, purpose, department, items }
 * @param {Object} params.actor requesting user
 * @param {Object} [params.req] express request (for audit metadata)
 */
const createClaim = async ({ employee, payload, actor, req }) => {
  const title = String(payload.title || '').trim();
  if (!title) throw ApiError.badRequest('Claim title is required');
  if (title.length > 160) throw ApiError.badRequest('Claim title is too long (max 160 characters)');

  const departmentId = payload.department || employee.department;
  if (!departmentId || !mongoose.isValidObjectId(String(departmentId))) {
    throw ApiError.badRequest('A department is required');
  }
  const department = await Department.findById(departmentId);
  if (!department) throw ApiError.badRequest('Department does not exist');
  if (department.isArchived) {
    throw ApiError.badRequest('This department is archived - claims cannot be raised against it');
  }
  if (
    actor.role === 'Employee' &&
    String(employee.department || '') !== String(department._id)
  ) {
    throw ApiError.forbidden('Employees can only raise claims for their own department');
  }

  const items = await validateClaimItems(payload.items || [], { enforceReceipts: false });

  // Every claim gets its human readable reference immediately - drafts are
  // visible to the employee in the UI and already referenceable in support
  // conversations. `submitClaim` only fills it in if it is still missing.
  const claimNo = await counterService.nextClaimNumber();

  const claim = await Claim.create({
    claimNo,
    title,
    purpose: String(payload.purpose || '').trim() || undefined,
    employee: employee._id,
    employeeName: employee.name,
    department: department._id,
    departmentName: department.name,
    items,
    status: CLAIM_STATUS.DRAFT,
    createdBy: actor._id,
  });
  claim.applyTotals();
  await claim.save();

  await auditService.recordFromRequest(req, {
    entityType: ENTITY_TYPES.CLAIM,
    entityId: claim._id,
    entityLabel: claim.claimNo || title,
    action: AUDIT_ACTIONS.CREATE,
    description: `Claim created as draft (${items.length} item(s))`,
  });

  return claim;
};

/**
 * Resolve the Finance Manager who should review a claim: the department's
 * configured manager first, otherwise an active Finance Manager fallback.
 */
const resolveAssignee = async (department) => {
  let manager = null;
  if (department?.manager) {
    manager = await User.findById(department.manager);
  }
  if (!manager || !manager.isActive || manager.role !== 'Finance Manager') {
    manager = await User.findOne({ role: 'Finance Manager', isActive: true }).sort({ createdAt: 1 });
  }
  if (!manager) {
    throw ApiError.badRequest('No active Finance Manager is available to review claims');
  }
  return manager;
};

/**
 * Submit a claim (Draft or Returned -> Submitted).
 * Validates receipts / limits, stamps the claim number, routes to the
 * department's Finance Manager and sets the SLA due date.
 */
const submitClaim = async ({ claim, actor, req }) => {
  if (claim.status !== CLAIM_STATUS.DRAFT && claim.status !== CLAIM_STATUS.RETURNED) {
    throw ApiError.badRequest(`A claim in status "${claim.status}" cannot be submitted`);
  }

  const settings = await getSettings();
  if (claim.items.length > settings.maxClaimItems) {
    throw ApiError.badRequest(`A claim cannot contain more than ${settings.maxClaimItems} items`);
  }

  // Re-validate every item on submit: receipts + limits are checked here.
  const rawItems = claim.items.map((item) => item.toObject());
  const department = await Department.findById(claim.department);
  const cleaned = await validateClaimItems(rawItems, { enforceReceipts: true });

  claim.set({ items: cleaned });
  claim.applyTotals();

  if (claim.totalRequested > settings.highValueThresholdAmount * 10) {
    throw ApiError.badRequest('The claim total exceeds the maximum allowed amount');
  }

  const previousStatus = claim.status;
  if (!claim.claimNo) {
    claim.claimNo = await counterService.nextClaimNumber();
  }

  const assignee =
    claim.status === CLAIM_STATUS.RETURNED && claim.assignedTo
      ? await User.findById(claim.assignedTo)
      : await resolveAssignee(department);
  if (!assignee || !assignee.isActive) {
    throw ApiError.badRequest('The assigned Finance Manager is no longer active');
  }

  claim.assignedTo = assignee._id;
  claim.assignedToName = assignee.name;
  claim.status = CLAIM_STATUS.SUBMITTED;
  claim.submittedAt = new Date();
  claim.dueAt = new Date(Date.now() + settings.approvalSlaDays * 24 * 60 * 60 * 1000);
  claim.lastComment = undefined;

  pushTimeline(claim, {
    action: REVIEW_ACTION.SUBMITTED,
    actor,
    previousStatus,
    newStatus: CLAIM_STATUS.SUBMITTED,
    meta: { assignedTo: assignee.name },
  });

  await claim.save();

  await notificationService.createNotification({
    user: assignee._id,
    type: NOTIFICATION_TYPES.CLAIM_SUBMITTED,
    title: 'New claim submitted',
    message: `${claim.employeeName} submitted claim ${claim.claimNo} (${claim.totalRequested}).`,
    link: `/claims/${claim._id}`,
    entityType: ENTITY_TYPES.CLAIM,
    entityId: claim._id,
  });

  await auditService.recordFromRequest(req, {
    entityType: ENTITY_TYPES.CLAIM,
    entityId: claim._id,
    entityLabel: claim.claimNo,
    action: AUDIT_ACTIONS.SUBMIT,
    description: `Claim submitted for review (${claim.totalRequested})`,
    before: { status: previousStatus },
    after: { status: CLAIM_STATUS.SUBMITTED, assignedTo: assignee.name },
  });

  return claim;
};

/**
 * Shared guards for every review action (approve / partial / reject /
 * return / reassign / receipt request).
 */
const assertReviewable = async ({ claim, actor, escalateCheck = false }) => {
  if (claim.status !== CLAIM_STATUS.SUBMITTED) {
    throw ApiError.badRequest(`A claim in status "${claim.status}" cannot be reviewed`);
  }
  // A user can never review their own claim - including Admins.
  if (String(claim.employee?._id || claim.employee) === String(actor._id)) {
    throw ApiError.forbidden('You cannot review your own claim');
  }
  // Approval threshold: claims above the configured amount require Admin.
  if (escalateCheck && actor.role === 'Finance Manager') {
    const settings = await getSettings();
    if (claim.totalRequested > settings.approvalThresholdAmount) {
      throw ApiError.forbidden(
        'This claim exceeds the approval threshold and requires Admin approval',
      );
    }
  }
};

/**
 * Apply item level approvals to a claim being approved.
 * Accepts an optional array of { itemId, approvedAmount } overrides; items
 * without an override are approved in full. Server side rules:
 *   0 <= approved <= requested, partial only when enabled in settings.
 */
const applyItemApprovals = (claim, overrides, settings) => {
  const overrideMap = new Map(
    (overrides || []).map((override) => [String(override.itemId), override]),
  );

  claim.items.forEach((item) => {
    const override = overrideMap.get(String(item._id));
    let approved = item.requestedAmount;
    if (override) {
      approved = round2(Number(override.approvedAmount));
      if (!Number.isFinite(approved) || approved < 0) {
        throw ApiError.badRequest('Approved amounts must be zero or positive numbers');
      }
      if (approved > item.requestedAmount) {
        throw ApiError.badRequest(
          `Item "${item.description}": approved amount cannot exceed the requested amount`,
        );
      }
      if (approved > 0 && approved < item.requestedAmount && !settings.allowPartialApproval) {
        throw ApiError.badRequest('Partial approval is disabled in the system settings');
      }
    }

    item.approvedAmount = approved;
    item.status =
      approved === 0
        ? ITEM_STATUS.REJECTED
        : approved < item.requestedAmount
          ? ITEM_STATUS.PARTIALLY_APPROVED
          : ITEM_STATUS.APPROVED;
  });

  claim.applyTotals();
  if (claim.totalApproved <= 0) {
    throw ApiError.badRequest(
      'At least one item must be approved - use the reject action to close a claim without payment',
    );
  }
  return claim;
};

/**
 * Approve a claim (full or partial at item level).
 * @param {Object} params
 * @param {Array} [params.overrides] [{ itemId, approvedAmount }]
 */
const approveClaim = async ({ claim, actor, overrides, req }) => {
  await assertReviewable({ claim, actor, escalateCheck: true });

  const settings = await getSettings();
  const previousStatus = claim.status;
  applyItemApprovals(claim, overrides, settings);

  claim.status = CLAIM_STATUS.APPROVED;
  pushTimeline(claim, {
    action: claim.totalApproved < claim.totalRequested
      ? REVIEW_ACTION.PARTIALLY_APPROVED
      : REVIEW_ACTION.APPROVED,
    actor,
    previousStatus,
    newStatus: CLAIM_STATUS.APPROVED,
    meta: { totalApproved: claim.totalApproved },
  });

  await claim.save();

  await notificationService.createNotification({
    user: claim.employee,
    type: NOTIFICATION_TYPES.CLAIM_APPROVED,
    title: 'Claim approved',
    message: `Your claim ${claim.claimNo} was approved for ${claim.totalApproved}${
      claim.totalApproved < claim.totalRequested ? ' (partially approved)' : ''
    }.`,
    link: `/claims/${claim._id}`,
    entityType: ENTITY_TYPES.CLAIM,
    entityId: claim._id,
  });

  await auditService.recordFromRequest(req, {
    entityType: ENTITY_TYPES.CLAIM,
    entityId: claim._id,
    entityLabel: claim.claimNo,
    action:
      claim.totalApproved < claim.totalRequested ? AUDIT_ACTIONS.PARTIAL_APPROVE : AUDIT_ACTIONS.APPROVE,
    description: `Claim approved for ${claim.totalApproved} of ${claim.totalRequested}`,
    before: { status: previousStatus },
    after: { status: CLAIM_STATUS.APPROVED, totalApproved: claim.totalApproved },
  });

  return claim;
};

/**
 * Reject a claim (comment mandatory). Closed without payment.
 */
const rejectClaim = async ({ claim, actor, comment, req }) => {
  await assertReviewable({ claim, actor });
  if (!comment || !String(comment).trim()) {
    throw ApiError.badRequest('A comment is required when rejecting a claim');
  }

  const previousStatus = claim.status;
  claim.status = CLAIM_STATUS.REJECTED;
  claim.lastComment = String(comment).trim();
  claim.items.forEach((item) => {
    if (item.status === ITEM_STATUS.PENDING) {
      item.approvedAmount = 0;
      item.status = ITEM_STATUS.REJECTED;
    }
  });
  claim.applyTotals();

  pushTimeline(claim, {
    action: REVIEW_ACTION.REJECTED,
    actor,
    comment: claim.lastComment,
    previousStatus,
    newStatus: CLAIM_STATUS.REJECTED,
  });

  await claim.save();

  await notificationService.createNotification({
    user: claim.employee,
    type: NOTIFICATION_TYPES.CLAIM_REJECTED,
    title: 'Claim rejected',
    message: `Your claim ${claim.claimNo} was rejected. Reason: ${claim.lastComment}`,
    link: `/claims/${claim._id}`,
    entityType: ENTITY_TYPES.CLAIM,
    entityId: claim._id,
  });

  await auditService.recordFromRequest(req, {
    entityType: ENTITY_TYPES.CLAIM,
    entityId: claim._id,
    entityLabel: claim.claimNo,
    action: AUDIT_ACTIONS.REJECT,
    description: 'Claim rejected',
    reason: claim.lastComment,
    before: { status: previousStatus },
    after: { status: CLAIM_STATUS.REJECTED },
  });

  return claim;
};

/**
 * Return a claim to the employee for correction (comment mandatory).
 * The employee can edit and resubmit; the same Finance Manager keeps it.
 */
const returnClaim = async ({ claim, actor, comment, req }) => {
  await assertReviewable({ claim, actor });
  if (!comment || !String(comment).trim()) {
    throw ApiError.badRequest('A comment is required when returning a claim');
  }

  const previousStatus = claim.status;
  claim.status = CLAIM_STATUS.RETURNED;
  claim.lastComment = String(comment).trim();

  pushTimeline(claim, {
    action: REVIEW_ACTION.RETURNED,
    actor,
    comment: claim.lastComment,
    previousStatus,
    newStatus: CLAIM_STATUS.RETURNED,
  });

  await claim.save();

  await notificationService.createNotification({
    user: claim.employee,
    type: NOTIFICATION_TYPES.CLAIM_RETURNED,
    title: 'Claim returned for correction',
    message: `Your claim ${claim.claimNo} was returned. Please correct and resubmit. Comment: ${claim.lastComment}`,
    link: `/claims/${claim._id}`,
    entityType: ENTITY_TYPES.CLAIM,
    entityId: claim._id,
  });

  await auditService.recordFromRequest(req, {
    entityType: ENTITY_TYPES.CLAIM,
    entityId: claim._id,
    entityLabel: claim.claimNo,
    action: AUDIT_ACTIONS.RETURN,
    description: 'Claim returned for correction',
    reason: claim.lastComment,
    before: { status: previousStatus },
    after: { status: CLAIM_STATUS.RETURNED },
  });

  return claim;
};

/**
 * Reassign a pending approval to another Finance Manager (reason mandatory).
 */
const reassignClaim = async ({ claim, actor, newAssigneeId, reason, req }) => {
  if (claim.status !== CLAIM_STATUS.SUBMITTED) {
    throw ApiError.badRequest('Only pending (submitted) approvals can be reassigned');
  }
  if (!reason || !String(reason).trim()) {
    throw ApiError.badRequest('A reason is required when reassigning an approval');
  }
  if (!newAssigneeId || !mongoose.isValidObjectId(String(newAssigneeId))) {
    throw ApiError.badRequest('A valid new assignee is required');
  }

  const assignee = await User.findById(newAssigneeId);
  if (!assignee || !assignee.isActive || assignee.role !== 'Finance Manager') {
    throw ApiError.badRequest('The new assignee must be an active Finance Manager');
  }
  if (String(assignee._id) === String(claim.employee?._id || claim.employee)) {
    throw ApiError.badRequest('A claim cannot be assigned to its own employee');
  }
  if (String(claim.assignedTo || '') === String(assignee._id)) {
    throw ApiError.badRequest('The claim is already assigned to this Finance Manager');
  }

  const previousAssignee = claim.assignedToName;
  claim.assignedTo = assignee._id;
  claim.assignedToName = assignee.name;

  pushTimeline(claim, {
    action: REVIEW_ACTION.REASSIGNED,
    actor,
    comment: String(reason).trim(),
    previousStatus: claim.status,
    newStatus: claim.status,
    meta: { from: previousAssignee, to: assignee.name },
  });

  await claim.save();

  await notificationService.createNotification({
    user: assignee._id,
    type: NOTIFICATION_TYPES.CLAIM_REASSIGNED,
    title: 'Approval reassigned to you',
    message: `Claim ${claim.claimNo} (${claim.totalRequested}) was reassigned to you. Reason: ${String(
      reason,
    ).trim()}`,
    link: `/claims/${claim._id}`,
    entityType: ENTITY_TYPES.CLAIM,
    entityId: claim._id,
  });

  await auditService.recordFromRequest(req, {
    entityType: ENTITY_TYPES.CLAIM,
    entityId: claim._id,
    entityLabel: claim.claimNo,
    action: AUDIT_ACTIONS.REASSIGN,
    description: `Approval reassigned from ${previousAssignee || 'unassigned'} to ${assignee.name}`,
    reason: String(reason).trim(),
    before: { assignedTo: previousAssignee },
    after: { assignedTo: assignee.name },
  });

  return claim;
};

/**
 * Request a receipt / more information (comment mandatory).
 * The claim stays Submitted; the employee is notified.
 */
const requestReceipt = async ({ claim, actor, comment, req }) => {
  await assertReviewable({ claim, actor });
  if (!comment || !String(comment).trim()) {
    throw ApiError.badRequest('A comment is required when requesting a receipt');
  }

  pushTimeline(claim, {
    action: REVIEW_ACTION.RECEIPT_REQUESTED,
    actor,
    comment: String(comment).trim(),
    previousStatus: claim.status,
    newStatus: claim.status,
  });

  await claim.save();

  await notificationService.createNotification({
    user: claim.employee,
    type: NOTIFICATION_TYPES.RECEIPT_REQUESTED,
    title: 'Receipt or information requested',
    message: `A reviewer requested more information on claim ${claim.claimNo}: ${String(
      comment,
    ).trim()}`,
    link: `/claims/${claim._id}`,
    entityType: ENTITY_TYPES.CLAIM,
    entityId: claim._id,
  });

  await auditService.recordFromRequest(req, {
    entityType: ENTITY_TYPES.CLAIM,
    entityId: claim._id,
    entityLabel: claim.claimNo,
    action: AUDIT_ACTIONS.UPDATE,
    description: 'Receipt or information requested',
    reason: String(comment).trim(),
  });

  return claim;
};

/**
 * Record a payment against an approved claim.
 * Rules: only approved amounts are payable, the amount cannot exceed the
 * outstanding balance, a payment reference is mandatory and the original
 * requested amounts are never touched. A fully paid claim becomes "Paid";
 * a partial payment keeps "Approved" (paymentStatus virtual reflects it).
 */
const payClaim = async ({ claim, actor, payload, req }) => {
  if (claim.status !== CLAIM_STATUS.APPROVED && claim.status !== CLAIM_STATUS.PAID) {
    throw ApiError.badRequest(`A claim in status "${claim.status}" cannot be paid`);
  }
  if (String(claim.employee?._id || claim.employee) === String(actor._id)) {
    throw ApiError.forbidden('You cannot record a payment on your own claim');
  }

  const amount = round2(Number(payload.amount));
  if (!Number.isFinite(amount) || amount < 0.01) {
    throw ApiError.badRequest('The payment amount must be a positive number');
  }
  const outstanding = round2(claim.totalApproved - claim.totalPaid);
  if (outstanding <= 0) {
    throw ApiError.badRequest('This claim is already fully paid');
  }
  if (amount > outstanding + 0.001) {
    throw ApiError.badRequest(
      `The payment amount (${amount}) cannot exceed the outstanding approved amount (${outstanding})`,
    );
  }

  const method = String(payload.method || '').trim();
  if (!PAYMENT_METHODS.includes(method)) {
    throw ApiError.badRequest(`The payment method must be one of: ${PAYMENT_METHODS.join(', ')}`);
  }
  const referenceNumber = String(payload.referenceNumber || '').trim();
  if (!referenceNumber) {
    throw ApiError.badRequest('A transaction reference is required');
  }
  const note = String(payload.note || '').trim() || undefined;

  claim.payments.push({
    amount,
    method,
    referenceNumber,
    paidAt: new Date(),
    recordedBy: actor._id,
    recordedByName: actor.name,
    note,
  });
  claim.paymentDetails = { paidAt: new Date(), method, referenceNumber };
  claim.applyTotals();

  const fullyPaid = claim.totalPaid >= claim.totalApproved - 0.001;
  const previousStatus = claim.status;
  if (fullyPaid && claim.status === CLAIM_STATUS.APPROVED) {
    claim.status = CLAIM_STATUS.PAID;
  }

  pushTimeline(claim, {
    action: REVIEW_ACTION.PAID,
    actor,
    previousStatus,
    newStatus: claim.status,
    comment: note,
    meta: { amount, method, referenceNumber, totalPaid: claim.totalPaid },
  });

  await claim.save();

  await notificationService.createNotification({
    user: claim.employee,
    type: NOTIFICATION_TYPES.CLAIM_PAID,
    title: 'Reimbursement paid',
    message: `Your claim ${claim.claimNo} was paid ${amount} via ${method} (ref ${referenceNumber}).`,
    link: `/claims/${claim._id}`,
    entityType: ENTITY_TYPES.CLAIM,
    entityId: claim._id,
  });

  await auditService.recordFromRequest(req, {
    entityType: ENTITY_TYPES.CLAIM,
    entityId: claim._id,
    entityLabel: claim.claimNo,
    action: AUDIT_ACTIONS.PAY,
    description: `Payment of ${amount} recorded (${method}, ref ${referenceNumber})`,
    before: { status: previousStatus, totalPaid: round2(claim.totalPaid - amount) },
    after: { status: claim.status, totalPaid: claim.totalPaid },
  });

  return claim;
};

/**
 * Append-only financial adjustment (Finance / Admin).
 * Paid claims are never silently changed - corrections are new entries.
 */
const addAdjustment = async ({ claim, actor, payload, req }) => {
  if (claim.status !== CLAIM_STATUS.APPROVED && claim.status !== CLAIM_STATUS.PAID) {
    throw ApiError.badRequest('Adjustments can only be made on approved or paid claims');
  }

  const type = String(payload.type || '').trim() === 'Deduct' ? 'Deduct' : 'Add';
  if (!['Add', 'Deduct'].includes(type)) {
    throw ApiError.badRequest('The adjustment type must be Add or Deduct');
  }
  const amount = round2(Number(payload.amount));
  if (!Number.isFinite(amount) || amount < 0.01) {
    throw ApiError.badRequest('The adjustment amount must be a positive number');
  }
  const reason = String(payload.reason || '').trim();
  if (!reason) {
    throw ApiError.badRequest('An adjustment reason is required');
  }
  const affectsPaidTotal = payload.affectsPaidTotal !== false;

  claim.adjustments.push({
    type,
    amount,
    reason,
    affectsPaidTotal,
    createdBy: actor._id,
    createdByName: actor.name,
    date: new Date(),
  });
  claim.applyTotals();

  pushTimeline(claim, {
    action: REVIEW_ACTION.ADJUSTED,
    actor,
    comment: reason,
    previousStatus: claim.status,
    newStatus: claim.status,
    meta: { type, amount, affectsPaidTotal, totalPaid: claim.totalPaid },
  });

  await claim.save();

  await auditService.recordFromRequest(req, {
    entityType: ENTITY_TYPES.CLAIM,
    entityId: claim._id,
    entityLabel: claim.claimNo,
    action: AUDIT_ACTIONS.ADJUST,
    description: `Adjustment ${type} of ${amount} applied`,
    reason,
    after: { totalPaid: claim.totalPaid, totalAdjusted: claim.totalAdjusted },
  });

  return claim;
};

module.exports = {
  validateClaimItems,
  createClaim,
  submitClaim,
  approveClaim,
  rejectClaim,
  returnClaim,
  reassignClaim,
  requestReceipt,
  payClaim,
  addAdjustment,
};









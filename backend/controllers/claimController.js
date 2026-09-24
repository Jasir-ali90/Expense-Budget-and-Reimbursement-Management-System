const Claim = require('../models/Claim');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendOk, sendCreated, sendMessage, sendPaginated } = require('../utils/apiResponse');
const { buildListQuery } = require('../utils/queryBuilder');
const { assertOwnership, optionalString, toBoolean } = require('../utils/validate');
const claimService = require('../services/claimService');
const auditService = require('../services/auditService');
const { toStoredFile, removeUploadedFile } = require('../middleware/upload');
const { CLAIM_STATUS, ENTITY_TYPES, AUDIT_ACTIONS } = require('../config/constants');

/**
 * Employee reimbursement claim controller.
 * Ownership is enforced on the backend: employees can only ever see and
 * touch their own claims, and submitted claims become read only.
 */

/** Role based visibility scope for list/read queries. */
const scopeFilter = (user) => {
  if (user.role === 'Employee') return { employee: user._id };
  return {};
};

/** Decorate claims with the derived overdue flag for dashboards/badges. */
const decorate = (claimDoc) => {
  const claim = claimDoc.toObject ? claimDoc.toObject({ virtuals: true }) : claimDoc;
  claim.isOverdue =
    claim.status === CLAIM_STATUS.SUBMITTED &&
    claim.dueAt &&
    new Date(claim.dueAt).getTime() < Date.now();
  return claim;
};

/**
 * @route GET /api/claims
 * @query search, status, department, employee, from, to, page, limit, sort
 * @access protected (employees see only their own claims)
 */
const listClaims = asyncHandler(async (req, res) => {
  const { filter, sort, skip, limit, page } = buildListQuery(req.query, {
    searchFields: ['title', 'claimNo', 'employeeName'],
    filters: [
      { field: 'status', type: 'string' },
      { field: 'department', type: 'objectId' },
      { field: 'employee', type: 'objectId' },
    ],
    dateField: 'submittedAt',
    sortableFields: ['createdAt', 'submittedAt', 'totalRequested', 'totalApproved', 'title'],
    defaultSort: { createdAt: -1 },
  });

  const query = { $and: [scopeFilter(req.user), filter].filter(Boolean) };

  // Category filter works at item level.
  if (req.query.category) {
    query.$and.push({ 'items.category': req.query.category });
  }

  const [claims, total] = await Promise.all([
    Claim.find(query).sort(sort).skip(skip).limit(limit).populate('employee', 'name email'),
    Claim.countDocuments(query),
  ]);

  sendPaginated(
    res,
    claims.map(decorate),
    { page, limit, total },
  );
});

/**
 * @route GET /api/claims/:id
 * @access protected (employees can only open their own claims)
 */
const getClaim = asyncHandler(async (req, res) => {
  const claim = await Claim.findById(req.params.id).populate('employee', 'name email');
  if (!claim) throw ApiError.notFound('Claim not found');

  if (req.user.role === 'Employee') {
    assertOwnership(req.user, claim.employee?._id || claim.employee, 'You can only view your own claims');
  }

  sendOk(res, { claim: decorate(claim) });
});

/**
 * @route POST /api/claims
 * @access Employee (+ Admin/Finance for testing only - service restricts
 *         employees to their own department)
 * Creates a Draft claim with one or more expense items.
 */
const createClaim = asyncHandler(async (req, res) => {
  const claim = await claimService.createClaim({
    employee: req.user,
    payload: req.body,
    actor: req.user,
    req,
  });
  sendCreated(res, { claim }, 'Claim created as draft');
});

/** Loads the claim and enforces ownership for employee actors. */
const loadOwnedClaim = async (req, message) => {
  const claim = await Claim.findById(req.params.id);
  if (!claim) throw ApiError.notFound('Claim not found');
  if (req.user.role === 'Employee') {
    assertOwnership(req.user, claim.employee?._id || claim.employee, message);
  }
  return claim;
};

/**
 * @route PUT /api/claims/:id
 * @access owner employee only
 * Draft (and returned) claims can be edited; submitted ones are read only.
 */
const updateClaim = asyncHandler(async (req, res) => {
  const claim = await loadOwnedClaim(req, 'You can only edit your own claims');
  if (claim.status !== CLAIM_STATUS.DRAFT && claim.status !== CLAIM_STATUS.RETURNED) {
    throw ApiError.badRequest(
      `A claim in status "${claim.status}" is read only - it must be returned before it can be edited`,
    );
  }

  const before = { title: claim.title, itemCount: claim.items.length, totalRequested: claim.totalRequested };

  if (req.body.title !== undefined) {
    const title = String(req.body.title).trim();
    if (!title) throw ApiError.badRequest('Claim title is required');
    if (title.length > 160) throw ApiError.badRequest('Claim title is too long (max 160 characters)');
    claim.title = title;
  }
  if (req.body.purpose !== undefined) {
    claim.purpose = String(req.body.purpose).trim() || undefined;
  }
  if (Array.isArray(req.body.items)) {
    // Receipts are not enforced while editing a draft - submit re-validates.
    const cleaned = await claimService.validateClaimItems(req.body.items, { enforceReceipts: false });
    claim.set({ items: cleaned });
  }

  claim.applyTotals();
  await claim.save();

  await auditService.recordFromRequest(req, {
    entityType: ENTITY_TYPES.CLAIM,
    entityId: claim._id,
    entityLabel: claim.claimNo || claim.title,
    action: AUDIT_ACTIONS.UPDATE,
    description: 'Draft claim edited',
    before,
    after: { title: claim.title, itemCount: claim.items.length, totalRequested: claim.totalRequested },
  });

  sendOk(res, { claim }, 'Claim updated');
});

/**
 * @route DELETE /api/claims/:id
 * @access owner employee only
 * Only drafts can be deleted; anything further is kept for the audit trail.
 */
const deleteClaim = asyncHandler(async (req, res) => {
  const claim = await loadOwnedClaim(req, 'You can only delete your own claims');
  if (claim.status !== CLAIM_STATUS.DRAFT) {
    throw ApiError.badRequest('Only draft claims can be deleted');
  }

  await claim.deleteOne();

  await auditService.recordFromRequest(req, {
    entityType: ENTITY_TYPES.CLAIM,
    entityId: claim._id,
    entityLabel: claim.claimNo || claim.title,
    action: AUDIT_ACTIONS.DELETE,
    description: 'Draft claim deleted',
  });

  sendMessage(res, 'Draft claim deleted');
});

/**
 * @route POST /api/claims/:id/submit
 * @access owner employee only
 * Validates receipts/limits, stamps the claim number and routes the claim
 * to the department's Finance Manager with an SLA due date.
 */
const submitClaim = asyncHandler(async (req, res) => {
  const claim = await loadOwnedClaim(req, 'You can only submit your own claims');
  const submitted = await claimService.submitClaim({ claim, actor: req.user, req });
  sendOk(res, { claim: submitted }, 'Claim submitted for review');
});

/**
 * Review endpoints (Finance Manager / Admin).
 * A user can never review their own claim; claims above the configured
 * approval threshold require Admin approval (service enforced).
 */

/** @route POST /api/claims/:id/approve  @body { overrides?: [{itemId, approvedAmount}] } */
const approveClaim = asyncHandler(async (req, res) => {
  const claim = await loadOwnedClaim(req, 'Claim not found');
  const updated = await claimService.approveClaim({
    claim,
    actor: req.user,
    overrides: Array.isArray(req.body.overrides) ? req.body.overrides : undefined,
    req,
  });
  sendOk(res, { claim: updated }, 'Claim approved');
});

/** @route POST /api/claims/:id/reject  @body { comment } (mandatory) */
const rejectClaim = asyncHandler(async (req, res) => {
  const claim = await loadOwnedClaim(req, 'Claim not found');
  const updated = await claimService.rejectClaim({
    claim,
    actor: req.user,
    comment: req.body.comment,
    req,
  });
  sendOk(res, { claim: updated }, 'Claim rejected');
});

/** @route POST /api/claims/:id/return  @body { comment } (mandatory) */
const returnClaim = asyncHandler(async (req, res) => {
  const claim = await loadOwnedClaim(req, 'Claim not found');
  const updated = await claimService.returnClaim({
    claim,
    actor: req.user,
    comment: req.body.comment,
    req,
  });
  sendOk(res, { claim: updated }, 'Claim returned for correction');
});

/** @route POST /api/claims/:id/request-receipt  @body { comment } (mandatory) */
const requestReceipt = asyncHandler(async (req, res) => {
  const claim = await loadOwnedClaim(req, 'Claim not found');
  const updated = await claimService.requestReceipt({
    claim,
    actor: req.user,
    comment: req.body.comment,
    req,
  });
  sendOk(res, { claim: updated }, 'Receipt / information requested');
});

/**
 * @route POST /api/claims/:id/reassign
 * @access Admin
 * @body { newAssigneeId, reason } (both mandatory)
 */
const reassignClaim = asyncHandler(async (req, res) => {
  const claim = await loadOwnedClaim(req, 'Claim not found');
  const updated = await claimService.reassignClaim({
    claim,
    actor: req.user,
    newAssigneeId: req.body.newAssigneeId,
    reason: req.body.reason,
    req,
  });
  sendOk(res, { claim: updated }, 'Approval reassigned');
});

/**
 * @route GET /api/claims/finance-managers
 * @access Admin
 * Active Finance Managers available as reassignment targets.
 */
const listFinanceManagers = asyncHandler(async (req, res) => {
  const User = require('../models/User');
  const managers = await User.find({ role: 'Finance Manager', isActive: true })
    .select('name email department')
    .sort({ name: 1 });
  sendOk(res, { financeManagers: managers });
});

/**
 * @route POST /api/claims/:id/payments
 * @access Finance Manager / Admin
 * @body { amount, method, referenceNumber, note? }
 * Only approved amounts are payable; requested amounts are never modified.
 */
const recordPayment = asyncHandler(async (req, res) => {
  const claim = await loadOwnedClaim(req, 'Claim not found');
  const updated = await claimService.payClaim({
    claim,
    actor: req.user,
    payload: req.body,
    req,
  });
  sendOk(res, { claim: updated }, 'Payment recorded');
});

/**
 * @route POST /api/claims/:id/adjustments
 * @access Finance Manager / Admin
 * @body { type: Add|Deduct, amount, reason, affectsPaidTotal? }
 * Append-only correction entries - paid claims are never silently changed.
 */
const addAdjustment = asyncHandler(async (req, res) => {
  const claim = await loadOwnedClaim(req, 'Claim not found');
  const updated = await claimService.addAdjustment({
    claim,
    actor: req.user,
    payload: req.body,
    req,
  });
  sendOk(res, { claim: updated }, 'Adjustment recorded');
});

/**
 * @route POST /api/claims/:id/items/:itemId/receipt
 * @access Employee (owner of a Draft or Returned claim)
 * multipart field: receipt
 * Attaches (or replaces) the receipt file on a single claim item.
 */
const uploadItemReceipt = asyncHandler(async (req, res) => {
  const claim = await loadOwnedClaim(req, 'Claim not found');

  // Ownership + editability: only the owner of an editable claim can upload.
  assertOwnership(req.user, claim.employee?._id || claim.employee, 'You can only upload receipts to your own claims');
  const editable = [CLAIM_STATUS.DRAFT, CLAIM_STATUS.RETURNED];
  if (!editable.includes(claim.status)) {
    throw ApiError.badRequest('Receipts can only be changed while the claim is a draft or returned');
  }
  if (!req.file) throw ApiError.badRequest('No receipt file was uploaded');

  const item = claim.items.id(req.params.itemId);
  if (!item) throw ApiError.notFound('Claim item not found');

  // Replace: clean up the previous stored file, if any.
  if (item.receipt?.fileName) {
    await removeUploadedFile(item.receipt.fileName);
  }

  item.receipt = toStoredFile(req.file);
  await claim.save();

  sendOk(res, { claim: decorate(claim) }, 'Receipt uploaded');
});

module.exports = {
  listClaims,
  getClaim,
  listFinanceManagers,
  createClaim,
  updateClaim,
  deleteClaim,
  submitClaim,
  uploadItemReceipt,
  approveClaim,
  rejectClaim,
  returnClaim,
  requestReceipt,
  reassignClaim,
  recordPayment,
  addAdjustment,
};

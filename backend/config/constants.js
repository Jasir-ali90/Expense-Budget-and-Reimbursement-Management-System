/**
 * Central list of enumerations and shared business constants.
 * Keeping these in one place guarantees the API, the models and the
 * frontend all speak the same vocabulary.
 */

const ROLES = Object.freeze({
  ADMIN: 'Admin',
  FINANCE_MANAGER: 'Finance Manager',
  EMPLOYEE: 'Employee',
});

const ROLE_VALUES = Object.freeze(Object.values(ROLES));

/** Statuses a reimbursement claim can have (as defined by the assignment). */
const CLAIM_STATUS = Object.freeze({
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  RETURNED: 'Returned',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  PAID: 'Paid',
});

const CLAIM_STATUS_VALUES = Object.freeze(Object.values(CLAIM_STATUS));

/** Statuses a direct company expense can have. */
const EXPENSE_STATUS = Object.freeze({
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  PAID: 'Paid',
});

const EXPENSE_STATUS_VALUES = Object.freeze(Object.values(EXPENSE_STATUS));

/** Derived payment state (a fully paid item keeps its Approved status). */
const PAYMENT_STATUS = Object.freeze({
  UNPAID: 'Unpaid',
  PARTIALLY_PAID: 'Partially Paid',
  PAID: 'Paid',
});

/** Item level review outcome. */
const ITEM_STATUS = Object.freeze({
  PENDING: 'Pending',
  APPROVED: 'Approved',
  PARTIALLY_APPROVED: 'Partially Approved',
  REJECTED: 'Rejected',
});

const ITEM_STATUS_VALUES = Object.freeze(Object.values(ITEM_STATUS));

/** Review actions a Finance Manager / Admin can apply to a claim. */
const REVIEW_ACTION = Object.freeze({
  APPROVED: 'Approved',
  PARTIALLY_APPROVED: 'Partially Approved',
  REJECTED: 'Rejected',
  RETURNED: 'Returned',
  REASSIGNED: 'Reassigned',
  RECEIPT_REQUESTED: 'Receipt Requested',
  PAID: 'Paid',
  ADJUSTED: 'Adjusted',
  SUBMITTED: 'Submitted',
});

const REVIEW_ACTION_VALUES = Object.freeze(Object.values(REVIEW_ACTION));

/** Actions that must always carry a comment/reason. */
const ACTIONS_REQUIRING_COMMENT = Object.freeze([
  REVIEW_ACTION.REJECTED,
  REVIEW_ACTION.RETURNED,
  REVIEW_ACTION.REASSIGNED,
  REVIEW_ACTION.RECEIPT_REQUESTED,
]);

const BUDGET_PERIOD_TYPE = Object.freeze({
  MONTHLY: 'Monthly',
  YEARLY: 'Yearly',
});

const BUDGET_PERIOD_TYPE_VALUES = Object.freeze(Object.values(BUDGET_PERIOD_TYPE));

/** Recurring expense labels - labels only, never auto-created. */
const RECURRING_LABELS = Object.freeze([
  'None',
  'Monthly',
  'Quarterly',
  'Half Yearly',
  'Yearly',
]);

const PAYMENT_METHODS = Object.freeze([
  'Bank Transfer',
  'Cheque',
  'Cash',
  'Corporate Card',
  'Payroll Adjustment',
]);

const NOTIFICATION_TYPES = Object.freeze({
  CLAIM_SUBMITTED: 'ClaimSubmitted',
  CLAIM_RETURNED: 'ClaimReturned',
  CLAIM_APPROVED: 'ClaimApproved',
  CLAIM_REJECTED: 'ClaimRejected',
  CLAIM_REASSIGNED: 'ClaimReassigned',
  CLAIM_PAID: 'ClaimPaid',
  RECEIPT_REQUESTED: 'ReceiptRequested',
  BUDGET_WARNING: 'BudgetWarning',
  BUDGET_EXCEEDED: 'BudgetExceeded',
  BUDGET_REVISED: 'BudgetRevised',
  EXPENSE_SUBMITTED: 'ExpenseSubmitted',
  EXPENSE_APPROVED: 'ExpenseApproved',
  EXPENSE_REJECTED: 'ExpenseRejected',
  EXPENSE_PAID: 'ExpensePaid',
  ACCOUNT_ACTIVATED: 'AccountActivated',
  ACCOUNT_DEACTIVATED: 'AccountDeactivated',
});
const NOTIFICATION_TYPE_VALUES = Object.freeze(Object.values(NOTIFICATION_TYPES));

const AUDIT_ACTIONS = Object.freeze({
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  ARCHIVE: 'ARCHIVE',
  RESTORE: 'RESTORE',
  SUBMIT: 'SUBMIT',
  APPROVE: 'APPROVE',
  PARTIAL_APPROVE: 'PARTIAL_APPROVE',
  REJECT: 'REJECT',
  RETURN: 'RETURN',
  REASSIGN: 'REASSIGN',
  PAY: 'PAY',
  ADJUST: 'ADJUST',
  ACTIVATE: 'ACTIVATE',
  DEACTIVATE: 'DEACTIVATE',
  REVISE_BUDGET: 'REVISE_BUDGET',
  CHANGE_PASSWORD: 'CHANGE_PASSWORD',
  UPDATE_SETTINGS: 'UPDATE_SETTINGS',
});

const ENTITY_TYPES = Object.freeze({
  USER: 'User',
  DEPARTMENT: 'Department',
  CATEGORY: 'Category',
  BUDGET: 'Budget',
  EXPENSE: 'Expense',
  CLAIM: 'Claim',
  PAYMENT: 'Payment',
  ADJUSTMENT: 'Adjustment',
  SETTING: 'Setting',
});

const ALLOWED_UPLOAD_EXTENSIONS = Object.freeze(['.jpg', '.jpeg', '.png', '.pdf']);
const ALLOWED_UPLOAD_MIME_TYPES = Object.freeze([
  'image/jpeg',
  'image/png',
  'application/pdf',
]);

/** Profile pictures: images only (a PDF makes no sense as an avatar). */
const ALLOWED_IMAGE_EXTENSIONS = Object.freeze(['.jpg', '.jpeg', '.png', '.webp']);
const ALLOWED_IMAGE_MIME_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);

/** System settings created on first boot / seed. */
const DEFAULT_SETTINGS = Object.freeze({
  companyName: 'Local Company (Sample Data Only)',
  currency: 'USD',
  currencySymbol: '$',
  fiscalYearStartMonth: 1,
  defaultBudgetWarningPercent: 80,
  approvalSlaDays: 3,
  /** Claim totals above this value escalate to a second-level approver. */
  approvalThresholdAmount: 2000,
  /** Claim totals at or above this value additionally require Admin review. */
  highValueThresholdAmount: 5000,
  allowPartialApproval: true,
  maxClaimItems: 20,
  requireReceiptByDefault: true,
  reminderBeforeDueDays: 1,
});

module.exports = {
  ROLES,
  ROLE_VALUES,
  CLAIM_STATUS,
  CLAIM_STATUS_VALUES,
  EXPENSE_STATUS,
  EXPENSE_STATUS_VALUES,
  PAYMENT_STATUS,
  ITEM_STATUS,
  ITEM_STATUS_VALUES,
  REVIEW_ACTION,
  REVIEW_ACTION_VALUES,
  ACTIONS_REQUIRING_COMMENT,
  BUDGET_PERIOD_TYPE,
  BUDGET_PERIOD_TYPE_VALUES,
  RECURRING_LABELS,
  PAYMENT_METHODS,
  NOTIFICATION_TYPES,
  NOTIFICATION_TYPE_VALUES,
  AUDIT_ACTIONS,
  ENTITY_TYPES,
  ALLOWED_UPLOAD_EXTENSIONS,
  ALLOWED_UPLOAD_MIME_TYPES,
  ALLOWED_IMAGE_EXTENSIONS,
  ALLOWED_IMAGE_MIME_TYPES,
  DEFAULT_SETTINGS,
};

/**
 * Enumerations mirrored from the backend (config/constants.js).
 * Kept in one place so every dropdown speaks the same vocabulary as the API.
 */

export const ROLES = ['Admin', 'Finance Manager', 'Employee'];

export const CLAIM_STATUS_OPTIONS = ['Draft', 'Submitted', 'Returned', 'Approved', 'Rejected', 'Paid'];

export const EXPENSE_STATUS_OPTIONS = ['Draft', 'Submitted', 'Approved', 'Rejected', 'Paid'];

export const PAYMENT_METHODS = [
  'Bank Transfer',
  'Cheque',
  'Cash',
  'Corporate Card',
  'Payroll Adjustment',
];

export const RECURRING_LABELS = ['None', 'Monthly', 'Quarterly', 'Half Yearly', 'Yearly'];

export const ITEM_STATUSES = ['Pending', 'Approved', 'Partially Approved', 'Rejected'];

export const BUDGET_PERIOD_TYPES = ['Monthly', 'Yearly'];

export const REVIEW_ACTIONS = [
  'Submitted',
  'Approved',
  'Partially Approved',
  'Rejected',
  'Returned',
  'Reassigned',
  'Receipt Requested',
  'Paid',
  'Adjusted',
];

/** Notification types that are budget related (used for badge colours). */
export const BUDGET_NOTIFICATION_TYPES = ['BudgetWarning', 'BudgetExceeded', 'BudgetRevised'];

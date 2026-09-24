const mongoose = require('mongoose');
const {
  CLAIM_STATUS_VALUES,
  CLAIM_STATUS,
  ITEM_STATUS_VALUES,
  ITEM_STATUS,
  REVIEW_ACTION_VALUES,
  PAYMENT_STATUS,
} = require('../config/constants');

/**
 * Employee reimbursement claim with one or more expense items.
 *
 * Totals (totalRequested / totalApproved / totalPaid) are always calculated on
 * the backend - values sent by the client are ignored.
 */

const receiptSchema = new mongoose.Schema(
  {
    fileName: String,
    originalName: String,
    mimeType: String,
    size: Number,
    url: String,
    extension: String,
  },
  { _id: false },
);

const claimItemSchema = new mongoose.Schema(
  {
    date: { type: Date, required: [true, 'Item date is required'] },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Item category is required'],
    },
    /** Snapshot of the category name so archived categories stay readable. */
    categoryName: { type: String, trim: true },
    description: { type: String, required: true, trim: true, maxlength: 500 },
    merchant: { type: String, trim: true, maxlength: 150 },
    requestedAmount: { type: Number, required: true, min: [0.01, 'Requested amount must be positive'] },
    approvedAmount: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ITEM_STATUS_VALUES, default: ITEM_STATUS.PENDING },
    reviewerComment: { type: String, trim: true, maxlength: 500 },
    receipt: receiptSchema,
  },
  { timestamps: true },
);

/** Difference between what was asked and what was approved for one item. */
claimItemSchema.virtual('variance').get(function variance() {
  return Math.round(((this.requestedAmount || 0) - (this.approvedAmount || 0)) * 100) / 100;
});

const paymentSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true, min: 0.01 },
    method: { type: String, required: true, trim: true },
    referenceNumber: { type: String, required: true, trim: true, maxlength: 120 },
    paidAt: { type: Date, default: Date.now },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recordedByName: { type: String, trim: true },
    note: { type: String, trim: true, maxlength: 300 },
  },
  { timestamps: true },
);

/**
 * Adjustments are append-only entries. Paid records are never silently
 * changed - a correction is created as a new adjustment instead.
 */
const adjustmentSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Add', 'Deduct'], required: true },
    amount: { type: Number, required: true, min: 0.01 },
    reason: { type: String, required: [true, 'An adjustment reason is required'], trim: true, maxlength: 500 },
    affectsPaidTotal: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdByName: { type: String, trim: true },
    date: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

/** Complete approval timeline shown to the employee. */
const timelineSchema = new mongoose.Schema(
  {
    action: { type: String, enum: REVIEW_ACTION_VALUES, required: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    actorName: { type: String, trim: true },
    actorRole: { type: String, trim: true },
    comment: { type: String, trim: true, maxlength: 500 },
    previousStatus: { type: String },
    newStatus: { type: String },
    meta: { type: mongoose.Schema.Types.Mixed },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: true },
);

const claimSchema = new mongoose.Schema(
  {
    /** Human readable reference, e.g. CLM-2026-000012 */
    claimNo: { type: String, trim: true, uppercase: true },

    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Claim owner is required'],
      index: true,
    },
    employeeName: { type: String, trim: true },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      required: [true, 'Department is required'],
      index: true,
    },
    departmentName: { type: String, trim: true },

    title: { type: String, required: [true, 'Claim title is required'], trim: true, maxlength: 160 },
    purpose: { type: String, trim: true, maxlength: 500 },
    items: {
      type: [claimItemSchema],
      validate: {
        validator(items) {
          return Array.isArray(items) && items.length > 0;
        },
        message: 'A claim must contain at least one expense item',
      },
    },

    totalRequested: { type: Number, default: 0, min: 0 },
    totalApproved: { type: Number, default: 0, min: 0 },
    totalPaid: { type: Number, default: 0, min: 0 },
    totalAdjusted: { type: Number, default: 0 },

    status: {
      type: String,
      enum: CLAIM_STATUS_VALUES,
      default: CLAIM_STATUS.DRAFT,
      index: true,
    },

    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    assignedToName: { type: String, trim: true },

    submittedAt: Date,
    dueAt: Date,
    reviewedAt: Date,
    returnedCount: { type: Number, default: 0, min: 0 },
    lastComment: { type: String, trim: true, maxlength: 500 },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

/**
 * Payments, adjustments and the complete approval timeline.
 * These live in a second `add()` call purely to keep the schema readable.
 */
claimSchema.add({
  payments: [paymentSchema],
  adjustments: [adjustmentSchema],
  timeline: [timelineSchema],
  /** Legacy-compatible snapshot of the final payment (also kept in payments[]). */
  paymentDetails: {
    paidAt: Date,
    method: String,
    referenceNumber: String,
  },
});

/** Draft and returned claims can be edited by the employee - everything else is read only. */
claimSchema.virtual('isEditable').get(function isEditable() {
  return this.status === CLAIM_STATUS.DRAFT || this.status === CLAIM_STATUS.RETURNED;
});

claimSchema.virtual('isLocked').get(function isLocked() {
  return !this.isEditable;
});

/** Derived payment state so a partially paid claim keeps its Approved status. */
claimSchema.virtual('paymentStatus').get(function paymentStatus() {
  const approved = Number(this.totalApproved || 0);
  const paid = Number(this.totalPaid || 0);
  if (paid <= 0) return PAYMENT_STATUS.UNPAID;
  if (approved > 0 && paid >= approved - 0.001) return PAYMENT_STATUS.PAID;
  return PAYMENT_STATUS.PARTIALLY_PAID;
});

claimSchema.virtual('outstandingAmount').get(function outstandingAmount() {
  const outstanding = Number(this.totalApproved || 0) - Number(this.totalPaid || 0);
  return outstanding > 0 ? Math.round(outstanding * 100) / 100 : 0;
});

/** Pending longer than the configured SLA. */
claimSchema.virtual('isOverdue').get(function isOverdue() {
  if (this.status !== CLAIM_STATUS.SUBMITTED) return false;
  if (!this.dueAt) return false;
  return new Date(this.dueAt).getTime() < Date.now();
});

/**
 * Recalculate every money total from the underlying items, payments and
 * adjustments. Called after any mutation so stored totals can never drift.
 */
claimSchema.methods.applyTotals = function applyTotals() {
  const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

  this.totalRequested = round2(
    (this.items || []).reduce((sum, item) => sum + (Number(item.requestedAmount) || 0), 0),
  );

  this.totalApproved = round2(
    (this.items || [])
      .filter((item) => item.status === ITEM_STATUS.APPROVED || item.status === ITEM_STATUS.PARTIALLY_APPROVED)
      .reduce((sum, item) => sum + (Number(item.approvedAmount) || 0), 0),
  );

  const paymentsTotal = (this.payments || []).reduce(
    (sum, payment) => sum + (Number(payment.amount) || 0),
    0,
  );

  const adjustmentDelta = (this.adjustments || []).reduce((sum, adjustment) => {
    if (adjustment.affectsPaidTotal === false) return sum;
    const amount = Number(adjustment.amount) || 0;
    return adjustment.type === 'Deduct' ? sum - amount : sum + amount;
  }, 0);

  this.totalAdjusted = round2(adjustmentDelta);
  const netPaid = round2(paymentsTotal + adjustmentDelta);
  this.totalPaid = netPaid > 0 ? netPaid : 0;

  return this;
};

claimSchema.index({ claimNo: 1 }, { unique: true, sparse: true });
claimSchema.index({ employee: 1, status: 1, createdAt: -1 });
claimSchema.index({ department: 1, status: 1 });
claimSchema.index({ assignedTo: 1, status: 1 });
claimSchema.index({ status: 1, dueAt: 1 });
claimSchema.index({ createdAt: -1 });

const Claim = mongoose.model('Claim', claimSchema);

module.exports = Claim;
// Backwards compatible aliases for older imports.
module.exports.Claim = Claim;
module.exports.ClaimItemSchema = claimItemSchema;
module.exports.receiptSchema = receiptSchema;


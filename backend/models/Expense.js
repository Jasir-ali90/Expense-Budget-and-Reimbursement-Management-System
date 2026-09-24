const mongoose = require('mongoose');
const { RECURRING_LABELS } = require('../config/constants');

/**
 * Direct company expense recorded by the Finance Manager.
 * Direct expenses never auto-generate future transactions - a recurring
 * expense is only *labelled* through recurringLabel.
 */

const expenseAdjustmentSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Add', 'Deduct'], required: true },
    amount: { type: Number, required: true, min: 0.01 },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: Date, default: Date.now },
  },
  { _id: true },
);

const expenseHistorySchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    comment: { type: String, trim: true, maxlength: 500 },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const expenseSchema = new mongoose.Schema(
  {
    expenseNo: { type: String, trim: true, uppercase: true },

    date: { type: Date, required: [true, 'Expense date is required'] },
    vendor: { type: String, required: [true, 'Vendor is required'], trim: true, maxlength: 150 },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Category is required'],
      index: true,
    },
    /** Snapshot so archived categories stay readable in historical reports. */
    categoryName: { type: String, trim: true },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      required: [true, 'Department is required'],
      index: true,
    },
    departmentName: { type: String, trim: true },
    description: { type: String, required: true, trim: true, maxlength: 500 },
    amount: { type: Number, required: true, min: 0.01 },
    approvedAmount: { type: Number, default: 0, min: 0 },
    paidAmount: { type: Number, default: 0, min: 0 },
    paymentMethod: { type: String, required: true, trim: true },

    recurringLabel: {
      type: String,
      enum: RECURRING_LABELS,
      default: 'None',
    },

    status: {
      type: String,
      enum: ['Draft', 'Submitted', 'Approved', 'Rejected', 'Paid'],
      default: 'Draft',
      index: true,
    },

    receipt: {
      fileName: String,
      originalName: String,
      mimeType: String,
      size: Number,
      url: String,
      extension: String,
    },

    submittedAt: Date,
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rejectedAt: Date,
    rejectionReason: { type: String, trim: true, maxlength: 500 },
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    paidAt: Date,
    paymentReference: { type: String, trim: true, maxlength: 120 },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    adjustments: [expenseAdjustmentSchema],
    history: [expenseHistorySchema],
  },
  { timestamps: true },
);

expenseSchema.index({ date: -1 });
expenseSchema.index({ vendor: 1 });
expenseSchema.index({ status: 1, department: 1, category: 1 });

module.exports = mongoose.model('Expense', expenseSchema);

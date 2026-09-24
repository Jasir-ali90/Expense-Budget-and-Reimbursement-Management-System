const mongoose = require('mongoose');
const { BUDGET_PERIOD_TYPE_VALUES, BUDGET_PERIOD_TYPE } = require('../config/constants');
const { isValidPeriod } = require('../utils/period');

/**
 * Department budget for one category and one period (Monthly "YYYY-MM" or
 * Yearly "YYYY"). A unique index prevents duplicate budgets for the same
 * department + category + period.
 *
 * allocated / used / committed / remaining are never stored blindly:
 * `allocatedAmount` is authoritative here while used & committed are always
 * derived by the budget service from approved and submitted records.
 */
const budgetHistorySchema = new mongoose.Schema(
  {
    revisedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    revisedByName: { type: String, trim: true },
    previousAmount: { type: Number, required: true },
    newAmount: { type: Number, required: true },
    previousWarningThresholdPercent: Number,
    newWarningThresholdPercent: Number,
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    date: { type: Date, default: Date.now },
  },
  { _id: true },
);

const budgetSchema = new mongoose.Schema(
  {
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      required: [true, 'Department is required'],
      index: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Category is required'],
      index: true,
    },
    periodType: {
      type: String,
      enum: BUDGET_PERIOD_TYPE_VALUES,
      default: BUDGET_PERIOD_TYPE.MONTHLY,
      required: true,
    },
    period: {
      type: String,
      required: [true, 'Budget period is required'],
      trim: true,
      validate: {
        validator(value) {
          return isValidPeriod(value, this.periodType);
        },
        message: 'Period must use YYYY-MM for monthly budgets or YYYY for yearly budgets',
      },
    },
    allocatedAmount: {
      type: Number,
      required: [true, 'Allocated amount is required'],
      min: [0, 'Allocated amount cannot be negative'],
    },
    warningThresholdPercent: { type: Number, default: 80, min: 1, max: 200 },
    notes: { type: String, trim: true, maxlength: 500 },

    /** Prevents duplicate warning/exceeded notifications for the same budget. */
    thresholdsNotified: {
      warning: { type: Boolean, default: false },
      exceeded: { type: Boolean, default: false },
    },

    history: [budgetHistorySchema],

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

/** Rule: no duplicate budget for the same department, category and period. */
budgetSchema.index({ department: 1, category: 1, period: 1 }, { unique: true });
budgetSchema.index({ period: -1, periodType: 1 });

module.exports = mongoose.model('Budget', budgetSchema);

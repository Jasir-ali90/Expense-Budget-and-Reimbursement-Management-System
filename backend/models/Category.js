const mongoose = require('mongoose');

/**
 * Expense category master data (Travel, Meals, Fuel, Software, ...).
 * A category can require a receipt and/or define a maximum claim amount.
 * Archived categories cannot be used for new claims/expenses but stay
 * visible in historical records.
 */
const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Category name is required'], trim: true, unique: true, maxlength: 120 },
    code: { type: String, trim: true, uppercase: true, default: null },
    description: { type: String, trim: true, maxlength: 500 },

    /** When true every claim item / expense of this category must carry a receipt. */
    requiresReceipt: { type: Boolean, default: true },

    /** Maximum amount allowed per claim item. null means "no limit". */
    maxClaimAmount: {
      type: Number,
      default: null,
      min: [0, 'Maximum claim amount cannot be negative'],
      validate: {
        validator(value) {
          return value === null || value === undefined || Number.isFinite(value);
        },
        message: 'Maximum claim amount must be a number or empty',
      },
    },

    /** Optional per-category warning threshold used by the budget service. */
    warningThresholdPercent: { type: Number, default: null, min: 1, max: 200 },

    isArchived: { type: Boolean, default: false, index: true },
    archivedAt: Date,
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    archiveReason: { type: String, trim: true, maxlength: 300 },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

categorySchema.index({ isArchived: 1, name: 1 });

categorySchema.virtual('hasClaimLimit').get(function hasClaimLimit() {
  return Number.isFinite(this.maxClaimAmount) && this.maxClaimAmount > 0;
});

module.exports = mongoose.model('Category', categorySchema);

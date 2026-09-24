const mongoose = require('mongoose');
const { DEFAULT_SETTINGS } = require('../config/constants');

/**
 * Single system-settings document (key = "system").
 * Admin editable values such as approval thresholds and SLA days.
 */
const settingSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'system', unique: true, required: true },
    companyName: { type: String, trim: true, default: DEFAULT_SETTINGS.companyName },
    currency: { type: String, trim: true, default: DEFAULT_SETTINGS.currency },
    currencySymbol: { type: String, trim: true, default: DEFAULT_SETTINGS.currencySymbol },
    fiscalYearStartMonth: {
      type: Number,
      min: 1,
      max: 12,
      default: DEFAULT_SETTINGS.fiscalYearStartMonth,
    },
    defaultBudgetWarningPercent: {
      type: Number,
      min: 1,
      max: 200,
      default: DEFAULT_SETTINGS.defaultBudgetWarningPercent,
    },
    approvalSlaDays: { type: Number, min: 1, max: 60, default: DEFAULT_SETTINGS.approvalSlaDays },
    approvalThresholdAmount: {
      type: Number,
      min: 0,
      default: DEFAULT_SETTINGS.approvalThresholdAmount,
    },
    highValueThresholdAmount: {
      type: Number,
      min: 0,
      default: DEFAULT_SETTINGS.highValueThresholdAmount,
    },
    allowPartialApproval: { type: Boolean, default: DEFAULT_SETTINGS.allowPartialApproval },
    maxClaimItems: { type: Number, min: 1, max: 100, default: DEFAULT_SETTINGS.maxClaimItems },
    requireReceiptByDefault: {
      type: Boolean,
      default: DEFAULT_SETTINGS.requireReceiptByDefault,
    },
    reminderBeforeDueDays: {
      type: Number,
      min: 0,
      max: 30,
      default: DEFAULT_SETTINGS.reminderBeforeDueDays,
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

/** Always return a usable settings document. */
settingSchema.statics.getSettings = async function getSettings() {
  let settings = await this.findOne({ key: 'system' });
  if (!settings) {
    settings = await this.create({ key: 'system', ...DEFAULT_SETTINGS });
  }
  return settings;
};

module.exports = mongoose.model('Setting', settingSchema);

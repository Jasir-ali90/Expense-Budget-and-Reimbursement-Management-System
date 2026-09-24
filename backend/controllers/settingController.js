const Setting = require('../models/Setting');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendOk } = require('../utils/apiResponse');
const { requireString, optionalAmount, toBoolean } = require('../utils/validate');
const auditService = require('../services/auditService');
const { AUDIT_ACTIONS, ENTITY_TYPES } = require('../config/constants');

/**
 * System settings controller.
 * Everyone can read the settings (the UI needs the currency + thresholds),
 * only Admin can change them, and every change is audited.
 */

/**
 * @route GET /api/settings
 * @access protected
 */
const getSettings = asyncHandler(async (req, res) => {
  const settings = await Setting.getSettings();
  sendOk(res, { settings });
});

/**
 * @route PUT /api/settings
 * @access Admin
 */
const updateSettings = asyncHandler(async (req, res) => {
  const settings = await Setting.getSettings();
  const before = settings.toObject();

  if (req.body.companyName !== undefined) {
    settings.companyName = requireString(req.body, 'companyName', { max: 150, label: 'Company name' });
  }
  if (req.body.currency !== undefined) {
    settings.currency = requireString(req.body, 'currency', { max: 8, label: 'Currency' }).toUpperCase();
  }
  if (req.body.currencySymbol !== undefined) {
    settings.currencySymbol = requireString(req.body, 'currencySymbol', {
      max: 5,
      label: 'Currency symbol',
    });
  }
  if (req.body.fiscalYearStartMonth !== undefined) {
    const month = Number(req.body.fiscalYearStartMonth);
    settings.fiscalYearStartMonth = Number.isFinite(month) && month >= 1 && month <= 12 ? month : 1;
  }
  if (req.body.defaultBudgetWarningPercent !== undefined) {
    const percent = Number(req.body.defaultBudgetWarningPercent);
    if (!Number.isFinite(percent) || percent < 1 || percent > 200) {
      throw ApiError.badRequest('Default budget warning percent must be between 1 and 200');
    }
    settings.defaultBudgetWarningPercent = percent;
  }
  if (req.body.approvalSlaDays !== undefined) {
    const days = Number(req.body.approvalSlaDays);
    if (!Number.isFinite(days) || days < 1 || days > 60) {
      throw ApiError.badRequest('Approval SLA days must be between 1 and 60');
    }
    settings.approvalSlaDays = Math.floor(days);
  }
  if (req.body.approvalThresholdAmount !== undefined) {
    settings.approvalThresholdAmount = optionalAmount(req.body, 'approvalThresholdAmount', {
      min: 0,
      label: 'Approval threshold',
    });
  }
  if (req.body.highValueThresholdAmount !== undefined) {
    settings.highValueThresholdAmount = optionalAmount(req.body, 'highValueThresholdAmount', {
      min: 0,
      label: 'High value threshold',
    });
  }
  if (settings.highValueThresholdAmount < settings.approvalThresholdAmount) {
    throw ApiError.badRequest('The high value threshold cannot be lower than the approval threshold');
  }
  if (req.body.allowPartialApproval !== undefined) {
    settings.allowPartialApproval = toBoolean(req.body.allowPartialApproval, settings.allowPartialApproval);
  }
  if (req.body.maxClaimItems !== undefined) {
    const maxItems = Number(req.body.maxClaimItems);
    settings.maxClaimItems = Number.isFinite(maxItems) && maxItems >= 1 && maxItems <= 100 ? Math.floor(maxItems) : 20;
  }
  if (req.body.requireReceiptByDefault !== undefined) {
    settings.requireReceiptByDefault = toBoolean(
      req.body.requireReceiptByDefault,
      settings.requireReceiptByDefault,
    );
  }
  if (req.body.reminderBeforeDueDays !== undefined) {
    const reminder = Number(req.body.reminderBeforeDueDays);
    settings.reminderBeforeDueDays = Number.isFinite(reminder) && reminder >= 0 && reminder <= 30 ? Math.floor(reminder) : 1;
  }

  settings.updatedBy = req.user._id;
  await settings.save();

  await auditService.recordFromRequest(req, {
    entityType: ENTITY_TYPES.SETTING,
    entityId: settings._id,
    entityLabel: settings.key,
    action: AUDIT_ACTIONS.UPDATE_SETTINGS,
    description: 'System settings updated',
    before: {
      approvalThresholdAmount: before.approvalThresholdAmount,
      approvalSlaDays: before.approvalSlaDays,
      allowPartialApproval: before.allowPartialApproval,
    },
    after: {
      approvalThresholdAmount: settings.approvalThresholdAmount,
      approvalSlaDays: settings.approvalSlaDays,
      allowPartialApproval: settings.allowPartialApproval,
    },
  });

  sendOk(res, { settings }, 'Settings updated successfully');
});

module.exports = { getSettings, updateSettings };

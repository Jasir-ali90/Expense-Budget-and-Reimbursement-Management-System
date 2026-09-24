const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

/**
 * Central audit-trail writer.
 * Every sensitive action (approval, rejection, reassignment, budget revision,
 * payment, adjustment, archive/restore, account activation change) goes
 * through here so nothing happens without a trace.
 */

const buildRequestMeta = (req) => {
  if (!req) return undefined;
  return {
    ip: req.ip || req.socket?.remoteAddress,
    userAgent: req.get ? req.get('user-agent') : undefined,
    method: req.method,
    path: req.originalUrl,
  };
};

/**
 * @param {Object} payload
 * @param {string} payload.entityType  e.g. ENTITY_TYPES.CLAIM
 * @param {ObjectId} [payload.entityId]
 * @param {string} [payload.entityLabel] human readable reference (claimNo, name)
 * @param {string} payload.action      e.g. AUDIT_ACTIONS.APPROVE
 * @param {string} payload.description short human readable summary
 * @param {string} [payload.reason]    mandatory for revisions/reassignments
 * @param {Object} [payload.before]    snapshot before the change
 * @param {Object} [payload.after]     snapshot after the change
 * @param {Object} [payload.actor]     user document performing the action
 * @param {Object} [payload.req]       express request (ip / user agent)
 */
const record = async (payload) => {
  try {
    const actor = payload.actor || payload.req?.user;
    return await AuditLog.create({
      entityType: payload.entityType,
      entityId: payload.entityId || undefined,
      entityLabel: payload.entityLabel,
      action: payload.action,
      description: payload.description,
      reason: payload.reason,
      performedBy: actor?._id || actor?.id,
      performedByName: actor?.name,
      performedByRole: actor?.role,
      before: payload.before,
      after: payload.after,
      meta: buildRequestMeta(payload.req),
    });
  } catch (error) {
    // Auditing must never break the main flow - but it must be visible.
    logger.error(`Audit log write failed for ${payload.entityType}/${payload.action}`, error);
    return null;
  }
};

/** Convenience wrapper for controller usage. */
const recordFromRequest = (req, payload) => record({ ...payload, req, actor: req.user });

/** Shallow "only these keys changed" snapshot helper. */
const diffSnapshot = (before = {}, after = {}) => {
  const changes = {};
  Object.keys(after).forEach((key) => {
    const beforeValue = before?.[key];
    const afterValue = after?.[key];
    const normalise = (value) =>
      value instanceof Date ? value.toISOString() : value && value._id ? String(value._id) : value;
    if (JSON.stringify(normalise(beforeValue)) !== JSON.stringify(normalise(afterValue))) {
      changes[key] = { from: normalise(beforeValue), to: normalise(afterValue) };
    }
  });
  return changes;
};

module.exports = { record, recordFromRequest, diffSnapshot };

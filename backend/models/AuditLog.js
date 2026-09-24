const mongoose = require('mongoose');

/**
 * Append-only audit trail.
 * Every approval, rejection, reassignment, budget revision, payment,
 * adjustment, archive/restore and account activation change is recorded here.
 */
const auditLogSchema = new mongoose.Schema(
  {
    entityType: { type: String, required: true, trim: true, index: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, index: true },
    entityLabel: { type: String, trim: true },
    action: { type: String, required: true, trim: true, index: true },
    description: { type: String, required: true, trim: true, maxlength: 500 },
    reason: { type: String, trim: true, maxlength: 500 },
    /**
     * Optional: automated events (e.g. budget threshold exceeded) have no
     * human actor and are recorded as system entries instead.
     */
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    performedByName: { type: String, trim: true, default: 'System' },
    performedByRole: { type: String, trim: true },
    before: { type: mongoose.Schema.Types.Mixed },
    after: { type: mongoose.Schema.Types.Mixed },
    meta: {
      ip: String,
      userAgent: String,
      method: String,
      path: String,
    },
  },
  { timestamps: true },
);

auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);

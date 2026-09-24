const mongoose = require('mongoose');

/**
 * Department master data.
 * Departments are archived (never hard deleted) so historical reports keep
 * showing the department name for old budgets, expenses and claims.
 */
const departmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Department name is required'], trim: true, unique: true, maxlength: 120 },
    code: { type: String, trim: true, uppercase: true, default: null },
    description: { type: String, trim: true, maxlength: 500 },

    /** Finance Manager responsible for reviewing this department's claims. */
    manager: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    isArchived: { type: Boolean, default: false, index: true },
    archivedAt: Date,
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    archiveReason: { type: String, trim: true, maxlength: 300 },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

departmentSchema.index({ isArchived: 1, name: 1 });

departmentSchema.virtual('isActive').get(function isActive() {
  return !this.isArchived;
});

module.exports = mongoose.model('Department', departmentSchema);

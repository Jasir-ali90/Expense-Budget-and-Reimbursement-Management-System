const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ROLE_VALUES, ROLES } = require('../config/constants');

/**
 * System user (Admin | Finance Manager | Employee).
 * Passwords are always hashed with bcrypt before they reach MongoDB.
 */
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true, maxlength: 120 },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    password: { type: String, required: [true, 'Password is required'], select: false },
    role: { type: String, enum: ROLE_VALUES, default: ROLES.EMPLOYEE, index: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
    employeeCode: { type: String, trim: true, uppercase: true, default: null },
    designation: { type: String, trim: true, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 30 },

    /**
     * Profile picture uploaded by the user from the Profile screen.
     * Stored as the same file shape as receipts (see middleware/upload.js)
     * so one helper serves both.
     */
    avatar: {
      fileName: { type: String, trim: true },
      originalName: { type: String, trim: true },
      mimeType: { type: String, trim: true },
      size: Number,
      url: { type: String, trim: true },
      extension: { type: String, trim: true },
      uploadedAt: Date,
    },

    isActive: { type: Boolean, default: true, index: true },
    deactivatedAt: Date,
    deactivationReason: { type: String, trim: true, maxlength: 300 },

    lastLoginAt: Date,
    /** select:false so it is only loaded where explicitly needed (auth middleware). */
    passwordChangedAt: { type: Date, select: false },
    mustChangePassword: { type: Boolean, default: false },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

/** Search helper used by the user list endpoint. */
userSchema.index({ name: 'text', email: 'text' });

userSchema.virtual('initials').get(function getInitials() {
  if (!this.name) return '';
  return this.name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
});

/**
 * Hash the password whenever it is created or changed.
 * Written as an async hook (no `next`) which is the supported style in
 * current Mongoose versions.
 */
userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  // -1s guards against tokens issued in the same second being rejected.
  this.passwordChangedAt = new Date(Date.now() - 1000);
});

userSchema.methods.matchPassword = function matchPassword(enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

/** Remove secrets before the document is serialised to the client. */
userSchema.methods.toPublicJSON = function toPublicJSON() {
  const object = this.toObject({ virtuals: true });
  delete object.password;
  delete object.passwordChangedAt;
  return object;
};

module.exports = mongoose.model('User', userSchema);

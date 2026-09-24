const mongoose = require('mongoose');

/**
 * Atomic sequence generator used for human readable document numbers
 * (CLM-2026-000123, EXP-2026-000045, ...).
 */
const counterSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    seq: { type: Number, default: 0 },
  },
  { timestamps: true },
);

/** Increment and return the next numeric value for a key. */
counterSchema.statics.nextSequence = async function nextSequence(key) {
  const counter = await this.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true },
  );
  return counter.seq;
};

module.exports = mongoose.model('Counter', counterSchema);

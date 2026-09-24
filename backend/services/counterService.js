const Counter = require('../models/Counter');

/**
 * Generates human readable document numbers such as
 *   CLM-2026-000123 / EXP-2026-000045 / BDG-2026-000007
 * using an atomic counter per prefix and year.
 */

const PREFIXES = Object.freeze({
  CLAIM: 'CLM',
  EXPENSE: 'EXP',
  BUDGET: 'BDG',
  PAYMENT: 'PAY',
});

const nextNumber = async (prefix, { year = new Date().getFullYear(), pad = 4 } = {}) => {
  const key = `${prefix}-${year}`;
  const sequence = await Counter.nextSequence(key);
  return `${prefix}-${year}-${String(sequence).padStart(pad, '0')}`;
};

const nextClaimNumber = (options) => nextNumber(PREFIXES.CLAIM, options);
const nextExpenseNumber = (options) => nextNumber(PREFIXES.EXPENSE, options);
const nextBudgetNumber = (options) => nextNumber(PREFIXES.BUDGET, options);
const nextPaymentNumber = (options) => nextNumber(PREFIXES.PAYMENT, options);

/** Reset every counter - used by the seed script. */
const resetCounters = (Model = Counter) => Model.deleteMany({});

module.exports = {
  PREFIXES,
  nextNumber,
  nextClaimNumber,
  nextExpenseNumber,
  nextBudgetNumber,
  nextPaymentNumber,
  resetCounters,
};

const { BUDGET_PERIOD_TYPE } = require('../config/constants');

/**
 * Budget periods are represented as strings so they are human readable in the
 * UI and exports:
 *   Monthly -> "YYYY-MM"  (e.g. 2026-09)
 *   Yearly  -> "YYYY"     (e.g. 2026)
 */

const MONTHLY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const YEARLY_PATTERN = /^\d{4}$/;

const isValidMonthlyPeriod = (value) => MONTHLY_PATTERN.test(String(value || ''));

const isValidYearlyPeriod = (value) => YEARLY_PATTERN.test(String(value || ''));

const isValidPeriod = (value, periodType) => {
  if (periodType === BUDGET_PERIOD_TYPE.YEARLY) return isValidYearlyPeriod(value);
  if (periodType === BUDGET_PERIOD_TYPE.MONTHLY) return isValidMonthlyPeriod(value);
  return isValidMonthlyPeriod(value) || isValidYearlyPeriod(value);
};

/** Infer the period type from the string format. */
const detectPeriodType = (value) =>
  isValidYearlyPeriod(value) ? BUDGET_PERIOD_TYPE.YEARLY : BUDGET_PERIOD_TYPE.MONTHLY;

const startOfDay = (date) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const endOfDay = (date) => {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
};

/**
 * Convert a period string into an inclusive date range usable in Mongo
 * queries ($gte start, $lte end).
 */
const periodToRange = (period) => {
  const value = String(period || '');
  if (isValidMonthlyPeriod(value)) {
    const [year, month] = value.split('-').map(Number);
    const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const end = new Date(year, month, 0, 23, 59, 59, 999);
    return { start, end };
  }
  if (isValidYearlyPeriod(value)) {
    const year = Number(value);
    return {
      start: new Date(year, 0, 1, 0, 0, 0, 0),
      end: new Date(year, 11, 31, 23, 59, 59, 999),
    };
  }
  return null;
};

const currentPeriod = (periodType = BUDGET_PERIOD_TYPE.MONTHLY, date = new Date()) => {
  const year = date.getFullYear();
  if (periodType === BUDGET_PERIOD_TYPE.YEARLY) return String(year);
  return `${year}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

/** "2026-09" -> "September 2026" | "2026" -> "2026" */
const periodLabel = (period) => {
  const value = String(period || '');
  if (isValidMonthlyPeriod(value)) {
    const [year, month] = value.split('-').map(Number);
    const label = new Date(year, month - 1, 1).toLocaleString('en-US', {
      month: 'long',
      year: 'numeric',
    });
    return label;
  }
  return value;
};

/** Validate an explicit from/to pair and normalise it to a date range. */
const resolveDateRange = ({ from, to } = {}) => {
  const range = {};
  if (from) {
    const start = new Date(from);
    if (Number.isNaN(start.getTime())) return null;
    range.start = startOfDay(start);
  }
  if (to) {
    const end = new Date(to);
    if (Number.isNaN(end.getTime())) return null;
    range.end = endOfDay(end);
  }
  if (range.start && range.end && range.start > range.end) {
    return { start: range.end, end: range.start, swapped: true };
  }
  return range;
};

/** "2026-03" -> [{year,month,label,period}] for trend charts. */
const listMonthlyPeriods = (fromDate, toDate) => {
  const periods = [];
  const cursor = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
  const last = new Date(toDate.getFullYear(), toDate.getMonth(), 1);
  while (cursor <= last) {
    const period = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    periods.push({
      period,
      year: cursor.getFullYear(),
      month: cursor.getMonth() + 1,
      label: periodLabel(period),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return periods;
};

module.exports = {
  isValidMonthlyPeriod,
  isValidYearlyPeriod,
  isValidPeriod,
  detectPeriodType,
  periodToRange,
  currentPeriod,
  periodLabel,
  resolveDateRange,
  listMonthlyPeriods,
  startOfDay,
  endOfDay,
};

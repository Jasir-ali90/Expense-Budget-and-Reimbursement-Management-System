/**
 * Monetary helpers. All amounts are stored as numbers rounded to 2 decimals so
 * totals stay consistent between the API, the reports and the CSV exports.
 */

const toAmount = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return NaN;
  return parsed;
};

const round2 = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
};

const sumAmounts = (values = []) =>
  round2(
    values.reduce((total, value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? total + parsed : total;
    }, 0),
  );

const isPositiveAmount = (value) => Number.isFinite(Number(value)) && Number(value) > 0;

const equalsAmount = (a, b) => round2(a) === round2(b);

const percentOf = (part, whole) => {
  const denominator = Number(whole);
  if (!Number.isFinite(denominator) || denominator <= 0) return 0;
  const numerator = Number(part);
  if (!Number.isFinite(numerator)) return 0;
  return round2((numerator / denominator) * 100);
};

module.exports = { toAmount, round2, sumAmounts, isPositiveAmount, equalsAmount, percentOf };

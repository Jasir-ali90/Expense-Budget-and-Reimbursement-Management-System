const ApiError = require('../utils/ApiError');

/**
 * Very small in-memory rate limiter.
 * Used to slow down brute-force login attempts without adding a dependency.
 * Purely local for this project (single process, local MongoDB).
 */

const buckets = new Map();

const cleanupExpired = (now) => {
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
};

const rateLimit = ({ windowMs = 15 * 60 * 1000, max = 20, message } = {}) => (req, res, next) => {
  const now = Date.now();
  if (buckets.size > 5000) cleanupExpired(now);

  const key = `${req.ip || 'unknown'}:${req.baseUrl}${req.path}`;
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return next();
  }

  bucket.count += 1;
  if (bucket.count > max) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
    res.set('Retry-After', String(retryAfter));
    return next(
      ApiError.unprocessable(
        message || `Too many requests. Please try again in ${retryAfter} seconds.`,
      ),
    );
  }

  return next();
};

const resetRateLimit = (req) => {
  const key = `${req.ip || 'unknown'}:${req.baseUrl}${req.path}`;
  buckets.delete(key);
};

module.exports = { rateLimit, resetRateLimit };

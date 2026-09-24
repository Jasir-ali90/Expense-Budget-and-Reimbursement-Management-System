/**
 * Wraps async express handlers so rejected promises reach the centralised
 * error handler instead of crashing the process. Required because Express 5
 * still does not forward async rejections automatically in all cases.
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;

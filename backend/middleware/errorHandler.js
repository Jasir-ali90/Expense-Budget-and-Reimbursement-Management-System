const multer = require('multer');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

/**
 * Centralised API error handling.
 * Converts any thrown error (validation, cast, duplicate key, JWT, multer)
 * into the uniform error envelope:
 *   { success: false, message: string, errors?: [...] }
 */

const MULTER_MESSAGES = {
  LIMIT_FILE_SIZE: `Uploaded file is too large. Maximum allowed size is ${Math.round(
    env.maxFileSize / (1024 * 1024),
  )} MB.`,
  LIMIT_FILE_COUNT: 'Too many files were uploaded in a single request.',
  LIMIT_UNEXPECTED_FILE: 'Unexpected file field in the upload request.',
  LIMIT_PART_COUNT: 'The upload request contained too many parts.',
};

/** The avatar field has its own (smaller) size cap, so it gets its own text. */
const multerMessage = (err) => {
  if (err.code === 'LIMIT_FILE_SIZE' && err.field === 'avatar') {
    return `Profile picture is too large. Maximum allowed size is ${Math.round(
      env.maxAvatarSize / (1024 * 1024),
    )} MB.`;
  }
  return MULTER_MESSAGES[err.code] || err.message;
};

const normalizeError = (err) => {
  if (err instanceof ApiError) return err;

  if (err instanceof multer.MulterError) {
    return new ApiError(400, multerMessage(err), { code: err.code });
  }

  if (err.name === 'ValidationError' && err.errors) {
    const details = Object.values(err.errors).map((item) => ({
      field: item.path,
      message: item.message,
    }));
    return new ApiError(422, 'Validation failed', details);
  }

  if (err.name === 'CastError') {
    return new ApiError(400, `Invalid value for "${err.path}"`, { value: err.value });
  }

  if (err.code === 11000) {
    const fields = Object.keys(err.keyValue || {});
    const label = fields.length > 0 ? fields.join(', ') : 'record';
    return new ApiError(409, `A record with the same ${label} already exists`, err.keyValue);
  }

  if (err.name === 'JsonWebTokenError') {
    return ApiError.unauthorized('Invalid authentication token');
  }

  if (err.name === 'TokenExpiredError') {
    return ApiError.unauthorized('Your session has expired. Please sign in again.');
  }

  if (err.type === 'entity.parse.failed') {
    return ApiError.badRequest('Request body contains invalid JSON');
  }

  if (err.statusCode && err.statusCode < 500) {
    return new ApiError(err.statusCode, err.message || 'Request could not be processed');
  }

  return ApiError.internal(
    env.isProduction ? 'Internal server error' : err.message || 'Internal server error',
  );
};

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  const normalized = normalizeError(err);

  if (normalized.statusCode >= 500) {
    logger.error(`${req.method} ${req.originalUrl} -> ${normalized.statusCode}`, err);
  } else {
    logger.debug(`${req.method} ${req.originalUrl} -> ${normalized.statusCode}: ${normalized.message}`);
  }

  const body = {
    success: false,
    message: normalized.message,
  };
  if (normalized.details !== undefined) body.errors = normalized.details;

  return res.status(normalized.statusCode).json(body);
};

/**
 * 404 handler - registered after all routes.
 * Uses a middleware (not a wildcard path) so it stays Express 5 compatible.
 */
const notFoundHandler = (req, res, next) => {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} was not found`));
};

module.exports = { errorHandler, notFoundHandler, normalizeError };

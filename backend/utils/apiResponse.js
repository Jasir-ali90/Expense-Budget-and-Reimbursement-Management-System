/**
 * Uniform API response envelope used by every endpoint:
 *   { success: true, message?: string, data: ..., meta?: {...} }
 */

const sendOk = (res, data = null, message = undefined, meta = undefined) => {
  const body = { success: true, data };
  if (message) body.message = message;
  if (meta) body.meta = meta;
  return res.status(200).json(body);
};

const sendCreated = (res, data = null, message = 'Resource created successfully') =>
  res.status(201).json({ success: true, message, data });

const sendMessage = (res, message, data = null, statusCode = 200) =>
  res.status(statusCode).json({ success: true, message, data });

/**
 * Paginated payload with the metadata the frontend DataTable needs.
 */
const sendPaginated = (res, items, { page, limit, total }, extraMeta = {}) => {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 1;
  return res.status(200).json({
    success: true,
    data: items,
    meta: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      ...extraMeta,
    },
  });
};

module.exports = { sendOk, sendCreated, sendMessage, sendPaginated };

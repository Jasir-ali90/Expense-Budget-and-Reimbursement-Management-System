const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendOk, sendPaginated, sendMessage } = require('../utils/apiResponse');
const { buildListQuery } = require('../utils/queryBuilder');

/**
 * Notification controller.
 * A user only ever sees their own notifications - the scope filter is applied
 * on the server and cannot be widened from the client.
 */

/**
 * @route GET /api/notifications
 * @query isRead, type, page, limit, sort
 * @access protected (own notifications)
 */
const listNotifications = asyncHandler(async (req, res) => {
  const { filter, sort, skip, limit, page } = buildListQuery(req.query, {
    searchFields: ['title', 'message'],
    filters: [
      { field: 'type', type: 'string' },
      { field: 'isRead', type: 'boolean' },
    ],
    sortableFields: ['createdAt', 'type', 'isRead'],
    defaultSort: { createdAt: -1 },
  });

  const query = { $and: [{ user: req.user._id }, filter] };

  const [items, total, unread] = await Promise.all([
    Notification.find(query).sort(sort).skip(skip).limit(limit),
    Notification.countDocuments(query),
    Notification.countDocuments({ user: req.user._id, isRead: false }),
  ]);

  sendPaginated(res, items, { page, limit, total }, { unread });
});

/**
 * @route GET /api/notifications/unread-count
 * @access protected
 * Lightweight endpoint polled by the frontend header badge.
 */
const unreadCount = asyncHandler(async (req, res) => {
  const count = await Notification.countDocuments({ user: req.user._id, isRead: false });
  sendOk(res, { unread: count });
});

/**
 * @route PATCH /api/notifications/:id/read
 * @access protected (owner only)
 */
const markAsRead = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('Invalid notification id');

  const notification = await Notification.findOne({ _id: id, user: req.user._id });
  if (!notification) throw ApiError.notFound('Notification not found');

  if (!notification.isRead) {
    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();
  }

  sendOk(res, { notification }, 'Notification marked as read');
});

/**
 * @route PATCH /api/notifications/read-all
 * @access protected
 */
const markAllAsRead = asyncHandler(async (req, res) => {
  const result = await Notification.updateMany(
    { user: req.user._id, isRead: false },
    { $set: { isRead: true, readAt: new Date() } },
  );
  sendMessage(res, `${result.modifiedCount || 0} notification(s) marked as read`);
});

/**
 * @route DELETE /api/notifications/:id
 * @access protected (owner only)
 */
const deleteNotification = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('Invalid notification id');

  const deleted = await Notification.findOneAndDelete({ _id: id, user: req.user._id });
  if (!deleted) throw ApiError.notFound('Notification not found');

  sendMessage(res, 'Notification dismissed');
});

module.exports = {
  listNotifications,
  unreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
};

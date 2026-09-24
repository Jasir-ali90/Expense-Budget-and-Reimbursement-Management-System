const express = require('express');
const {
  listNotifications,
  unreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} = require('../controllers/notificationController');
const { protect } = require('../middleware/auth');

/**
 * Notification routes.
 * A user only ever reads their own notifications - the controller scopes
 * every query by the authenticated user.
 */
const router = express.Router();

router.use(protect);

router.get('/', listNotifications);
router.get('/unread-count', unreadCount);
router.patch('/read-all', markAllAsRead);
router.patch('/:id/read', markAsRead);
router.delete('/:id', deleteNotification);

module.exports = router;

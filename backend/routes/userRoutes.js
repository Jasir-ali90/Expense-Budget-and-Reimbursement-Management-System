const express = require('express');
const {
  listUsers,
  getUser,
  createUser,
  updateUser,
  setUserStatus,
  resetPassword,
  updateMyAvatar,
  removeMyAvatar,
} = require('../controllers/userController');
const { protect, isFinanceOrAdmin, isAdmin } = require('../middleware/auth');
const { uploadAvatar } = require('../middleware/upload');

/**
 * User management routes.
 * Read: Admin + Finance Manager. Write: Admin only.
 * Profile picture: self service for every signed in user.
 */
const router = express.Router();

router.use(protect);

/**
 * Declared before the /:id routes: "me" is a literal segment, never an id.
 * Any role (Admin, Finance Manager, Employee) can manage their own picture.
 */
router.post('/me/avatar', uploadAvatar, updateMyAvatar);
router.delete('/me/avatar', removeMyAvatar);

router.route('/').get(isFinanceOrAdmin, listUsers).post(isAdmin, createUser);
router.route('/:id').get(isFinanceOrAdmin, getUser).put(isAdmin, updateUser);
router.patch('/:id/status', isAdmin, setUserStatus);
router.post('/:id/reset-password', isAdmin, resetPassword);

module.exports = router;

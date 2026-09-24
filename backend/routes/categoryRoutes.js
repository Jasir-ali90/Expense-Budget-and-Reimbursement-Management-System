const express = require('express');
const {
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  archiveCategory,
  restoreCategory,
} = require('../controllers/categoryController');
const { protect, isAdmin } = require('../middleware/auth');

/**
 * Category routes. Reads open to all authenticated roles,
 * writes restricted to Admin.
 */
const router = express.Router();

router.use(protect);

router.route('/').get(listCategories).post(isAdmin, createCategory);
router.route('/:id').get(getCategory).put(isAdmin, updateCategory);
router.patch('/:id/archive', isAdmin, archiveCategory);
router.patch('/:id/restore', isAdmin, restoreCategory);

module.exports = router;

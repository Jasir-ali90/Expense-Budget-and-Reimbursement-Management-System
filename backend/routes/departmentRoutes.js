const express = require('express');
const {
  listDepartments,
  getDepartment,
  createDepartment,
  updateDepartment,
  archiveDepartment,
  restoreDepartment,
} = require('../controllers/departmentController');
const { protect, isAdmin } = require('../middleware/auth');

/**
 * Department routes. Reads open to all authenticated roles,
 * writes restricted to Admin.
 */
const router = express.Router();

router.use(protect);

router.route('/').get(listDepartments).post(isAdmin, createDepartment);
router.route('/:id').get(getDepartment).put(isAdmin, updateDepartment);
router.patch('/:id/archive', isAdmin, archiveDepartment);
router.patch('/:id/restore', isAdmin, restoreDepartment);

module.exports = router;

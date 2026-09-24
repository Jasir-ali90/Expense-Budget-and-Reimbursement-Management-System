const express = require('express');
const {
  listBudgets,
  getBudget,
  createBudget,
  reviseBudget,
  deleteBudget,
} = require('../controllers/budgetController');
const { protect, isFinanceOrAdmin, isAdmin } = require('../middleware/auth');

/**
 * Budget routes.
 * Read: Admin + Finance Manager. Create/revise/delete: Admin only
 * (revision requires a mandatory reason and is fully audited).
 */
const router = express.Router();

router.use(protect);

router.route('/').get(isFinanceOrAdmin, listBudgets).post(isAdmin, createBudget);
router.route('/:id').get(isFinanceOrAdmin, getBudget);
router.post('/:id/revise', isAdmin, reviseBudget);
router.route('/:id').delete(isAdmin, deleteBudget);

module.exports = router;

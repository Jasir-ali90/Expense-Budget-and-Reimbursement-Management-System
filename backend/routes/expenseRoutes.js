const express = require('express');
const {
  listExpenses,
  getExpense,
  createExpense,
  updateExpense,
  submitExpense,
  approveExpense,
  rejectExpense,
  payExpense,
  createAdjustment,
  deleteExpense,
} = require('../controllers/expenseController');
const { protect, isFinanceOrAdmin, isAdmin } = require('../middleware/auth');
const { uploadReceipt } = require('../middleware/upload');

/**
 * Direct company expense routes.
 * Write (create/update/submit): Admin + Finance Manager.
 * Approve / reject / pay / adjust: Finance Manager (Admin can too).
 */
const router = express.Router();

router.use(protect);

router
  .route('/')
  .get(isFinanceOrAdmin, listExpenses)
  .post(isFinanceOrAdmin, uploadReceipt, createExpense);

router
  .route('/:id')
  .get(isFinanceOrAdmin, getExpense)
  .put(isFinanceOrAdmin, uploadReceipt, updateExpense)
  .delete(isAdmin, deleteExpense);

router.post('/:id/submit', isFinanceOrAdmin, submitExpense);
router.post('/:id/approve', isFinanceOrAdmin, approveExpense);
router.post('/:id/reject', isFinanceOrAdmin, rejectExpense);
router.post('/:id/pay', isFinanceOrAdmin, payExpense);
router.post('/:id/adjustments', isFinanceOrAdmin, createAdjustment);

module.exports = router;

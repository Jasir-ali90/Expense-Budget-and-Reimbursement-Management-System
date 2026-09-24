const express = require('express');
const {
  expenseReport,
  claimReport,
  approvalSummary,
  budgetUsageReport,
  monthlyTrendReport,
  topCategoriesReport,
  topVendorsReport,
  employeeReimbursementReport,
} = require('../controllers/reportController');
const { protect, isFinanceOrAdmin } = require('../middleware/auth');

/**
 * Report routes.
 * Financial reports are Admin + Finance Manager only. The employee
 * reimbursement history is additionally available to employees, but the
 * controller restricts them to their own rows.
 *
 * Append ?format=csv to any report to download the filtered result set.
 */
const router = express.Router();

router.use(protect);

router.get('/expenses', isFinanceOrAdmin, expenseReport);
router.get('/claims', isFinanceOrAdmin, claimReport);
router.get('/approval-summary', isFinanceOrAdmin, approvalSummary);
router.get('/budget-usage', isFinanceOrAdmin, budgetUsageReport);
router.get('/monthly-trend', isFinanceOrAdmin, monthlyTrendReport);
router.get('/top-categories', isFinanceOrAdmin, topCategoriesReport);
router.get('/top-vendors', isFinanceOrAdmin, topVendorsReport);
router.get('/employee-reimbursements', employeeReimbursementReport);

module.exports = router;

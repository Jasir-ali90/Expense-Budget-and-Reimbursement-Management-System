const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { uploadReceipt } = require('../middleware/upload');
const {
  listClaims,
  getClaim,
  listFinanceManagers,
  createClaim,
  updateClaim,
  deleteClaim,
  submitClaim,
  uploadItemReceipt,
  approveClaim,
  rejectClaim,
  returnClaim,
  requestReceipt,
  reassignClaim,
  recordPayment,
  addAdjustment,
} = require('../controllers/claimController');
const { ROLES } = require('../config/constants');

/**
 * Employee reimbursement claim routes.
 * Approval / payment / adjustment endpoints are Finance (+ Admin) only;
 * everything ownership sensitive is additionally enforced in the controller
 * and in the claim service, never trusting the client.
 */
const router = express.Router();

/** Static paths first so they never collide with /:id. */
router.get('/finance-managers', protect, authorize(ROLES.ADMIN), listFinanceManagers);

router
  .route('/')
  .get(protect, listClaims)
  .post(protect, authorize(ROLES.EMPLOYEE, ROLES.ADMIN), createClaim);

router
  .route('/:id')
  .get(protect, getClaim)
  .put(protect, updateClaim)
  .delete(protect, deleteClaim);

router.post('/:id/submit', protect, submitClaim);

/** Finance manager review actions (Admin may also act). */
const isFinance = authorize(ROLES.FINANCE_MANAGER, ROLES.ADMIN);
router.post('/:id/approve', protect, isFinance, approveClaim);
router.post('/:id/reject', protect, isFinance, rejectClaim);
router.post('/:id/return', protect, isFinance, returnClaim);
router.post('/:id/request-receipt', protect, isFinance, requestReceipt);
router.post('/:id/reassign', protect, authorize(ROLES.ADMIN), reassignClaim);

/** Payments and adjustments - Finance only, backend validated amounts. */
router.post('/:id/payments', protect, isFinance, recordPayment);
router.post('/:id/adjustments', protect, isFinance, addAdjustment);

/** Receipt upload for a single item (multipart field: receipt). */
router.post('/:id/items/:itemId/receipt', protect, uploadReceipt, uploadItemReceipt);

module.exports = router;

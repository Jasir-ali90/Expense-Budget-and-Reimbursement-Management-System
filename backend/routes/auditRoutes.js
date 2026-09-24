const express = require('express');
const {
  listAuditLogs,
  getEntityHistory,
  exportAuditLogs,
} = require('../controllers/auditController');
const { protect, isFinanceOrAdmin } = require('../middleware/auth');

/**
 * Audit trail routes (read only - the log is append-only by design).
 * Restricted to Admin and Finance Manager.
 */
const router = express.Router();

router.use(protect, isFinanceOrAdmin);

router.get('/', listAuditLogs);
router.get('/export', exportAuditLogs);
router.get('/entity/:entityType/:entityId', getEntityHistory);

module.exports = router;

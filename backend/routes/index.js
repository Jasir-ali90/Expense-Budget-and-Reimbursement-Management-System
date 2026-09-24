const express = require('express');
const env = require('../config/env');
const { getDatabaseName, isLocalMongoUri } = require('../config/db');
const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const departmentRoutes = require('./departmentRoutes');
const categoryRoutes = require('./categoryRoutes');
const budgetRoutes = require('./budgetRoutes');
const expenseRoutes = require('./expenseRoutes');
const claimRoutes = require('./claimRoutes');
const notificationRoutes = require('./notificationRoutes');
const auditRoutes = require('./auditRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const reportRoutes = require('./reportRoutes');
const settingRoutes = require('./settingRoutes');

/**
 * API router root.
 * Every feature router is mounted here so `app.js` only has to know about a
 * single entry point. Routers are added feature by feature.
 */
const router = express.Router();

/**
 * GET /api/health
 * Liveness probe used by the frontend and by the local smoke tests.
 */
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'ok',
      service: 'expense-budget-reimbursement-api',
      environment: env.nodeEnv,
      database: {
        name: getDatabaseName(),
        local: isLocalMongoUri(),
      },
      timestamp: new Date().toISOString(),
    },
  });
});

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/departments', departmentRoutes);
router.use('/categories', categoryRoutes);
router.use('/budgets', budgetRoutes);
router.use('/expenses', expenseRoutes);
router.use('/claims', claimRoutes);
router.use('/notifications', notificationRoutes);
router.use('/audit-logs', auditRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/reports', reportRoutes);
router.use('/settings', settingRoutes);

/**
 * GET /api/docs
 * Human readable, locally accessible API documentation. The endpoint list
 * mirrors documentation/API.md, which is the single source of truth.
 */
router.get('/docs', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      name: 'Expense, Budget and Reimbursement Management System API',
      version: '1.0.0',
      documentation: 'documentation/API.md',
      postman: 'documentation/postman-collection.json',
      auth: 'Bearer <JWT> from POST /api/auth/login',
    },
  });
});

module.exports = router;


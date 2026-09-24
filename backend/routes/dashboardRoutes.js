const express = require('express');
const { getDashboard } = require('../controllers/dashboardController');
const { protect } = require('../middleware/auth');

/**
 * Dashboard route.
 * Available to every authenticated role - the controller returns a payload
 * scoped to the caller's role (employees only ever see their own claims).
 */
const router = express.Router();

router.get('/', protect, getDashboard);

module.exports = router;

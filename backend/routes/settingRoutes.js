const express = require('express');
const { getSettings, updateSettings } = require('../controllers/settingController');
const { protect, isAdmin } = require('../middleware/auth');

/**
 * System settings routes.
 * Read: any authenticated user (the UI needs currency + thresholds).
 * Update: Admin only, audited as UPDATE_SETTINGS.
 */
const router = express.Router();

router.use(protect);

router.route('/').get(getSettings).put(isAdmin, updateSettings);

module.exports = router;

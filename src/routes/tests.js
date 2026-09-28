const express = require('express');
const testController = require('../controllers/testController');
const asyncHandler = require('../middleware/asyncHandler');
const requireAuth = require('../middleware/requireAuth');
const requireAdmin = require('../middleware/requireAdmin');

const router = express.Router();

router.get('/', asyncHandler(testController.listTests));
router.post('/', requireAuth, requireAdmin, asyncHandler(testController.createTest));
router.patch('/:id', requireAuth, requireAdmin, asyncHandler(testController.updateTest));

module.exports = router;

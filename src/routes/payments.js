const express = require('express');
const paymentController = require('../controllers/paymentController');
const asyncHandler = require('../middleware/asyncHandler');
const requireAuth = require('../middleware/requireAuth');
const requireWebhookSecret = require('../middleware/requireWebhookSecret');

const router = express.Router();

router.post('/webhook', requireWebhookSecret, asyncHandler(paymentController.handleWebhook));
router.post('/', requireAuth, asyncHandler(paymentController.createPayment));

module.exports = router;

const express = require('express');
const bookingController = require('../controllers/bookingController');
const asyncHandler = require('../middleware/asyncHandler');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

router.post('/', requireAuth, asyncHandler(bookingController.createBooking));
router.get('/', requireAuth, asyncHandler(bookingController.listBookings));
router.get('/:id', requireAuth, asyncHandler(bookingController.getBooking));
router.post('/:id/cancel', requireAuth, asyncHandler(bookingController.cancelBooking));

module.exports = router;

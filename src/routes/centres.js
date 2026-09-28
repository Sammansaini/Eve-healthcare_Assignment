const express = require('express');
const centreController = require('../controllers/centreController');
const asyncHandler = require('../middleware/asyncHandler');
const requireAuth = require('../middleware/requireAuth');
const requireAdmin = require('../middleware/requireAdmin');

const router = express.Router();

router.get('/', asyncHandler(centreController.listCentres));
router.post('/', requireAuth, requireAdmin, asyncHandler(centreController.createCentre));
router.get('/:id', asyncHandler(centreController.getCentre));
router.patch('/:id', requireAuth, requireAdmin, asyncHandler(centreController.updateCentre));
router.put(
  '/:centreId/tests/:testId',
  requireAuth,
  requireAdmin,
  asyncHandler(centreController.setCentreTestPrice)
);

module.exports = router;

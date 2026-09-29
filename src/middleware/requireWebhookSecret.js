const crypto = require('crypto');
const config = require('../config');
const { createError } = require('../utils');

function secretsMatch(provided, expected) {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

// The provider sends the shared secret. This route does not use a user JWT.
function requireWebhookSecret(req, res, next) {
  const header = req.headers['x-webhook-secret'];
  if (typeof header !== 'string' || header.length === 0) {
    next(createError(401, 'Webhook secret is required'));
    return;
  }
  if (!secretsMatch(header, config.webhookSecret)) {
    next(createError(401, 'Invalid webhook secret'));
    return;
  }
  next();
}

module.exports = requireWebhookSecret;

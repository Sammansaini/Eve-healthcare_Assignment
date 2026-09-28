const jwt = require('jsonwebtoken');
const config = require('../config');
const { createError } = require('../utils');

// Expects: Authorization: Bearer <token>
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    next(createError(401, 'Authentication required'));
    return;
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    const userId = Number(payload.sub);

    if (!Number.isInteger(userId) || userId <= 0) {
      next(createError(401, 'Invalid token'));
      return;
    }

    req.userId = userId;
    next();
  } catch {
    next(createError(401, 'Invalid or expired token'));
  }
}

module.exports = requireAuth;

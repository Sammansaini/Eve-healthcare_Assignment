const db = require('../db');
const asyncHandler = require('./asyncHandler');
const { createError } = require('../utils');

// The JWT only identifies the user. Role is read from the database so a
// promotion applies on the next request without a new token.
const requireAdmin = asyncHandler(async (req, res, next) => {
  const result = await db.query(
    'SELECT role FROM users WHERE id = $1',
    [req.userId]
  );
  const user = result.rows[0];

  if (!user) {
    throw createError(401, 'Invalid or expired token');
  }
  if (user.role !== 'ADMIN') {
    throw createError(403, 'Admin access is required');
  }

  next();
});

module.exports = requireAdmin;

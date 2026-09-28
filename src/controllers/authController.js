const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const config = require('../config');
const { createError } = require('../utils');

const BCRYPT_ROUNDS = 10;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toPublicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    created_at: row.created_at,
  };
}

function readSignupInput(body) {
  const source = body || {};
  const name = typeof source.name === 'string' ? source.name.trim() : '';
  const email = typeof source.email === 'string' ? source.email.trim().toLowerCase() : '';
  const password = typeof source.password === 'string' ? source.password : '';

  if (!name || !email || !password) {
    throw createError(400, 'Name, email, and password are required');
  }
  if (name.length > 100) {
    throw createError(400, 'Name must be 100 characters or fewer');
  }
  if (!EMAIL_PATTERN.test(email) || email.length > 255) {
    throw createError(400, 'Email must be a valid email address');
  }
  if (password.length < 8 || password.length > 72) {
    throw createError(400, 'Password must be between 8 and 72 characters');
  }

  return { name, email, password };
}

function readLoginInput(body) {
  const source = body || {};
  const email = typeof source.email === 'string' ? source.email.trim().toLowerCase() : '';
  const password = typeof source.password === 'string' ? source.password : '';

  if (!email || !password) {
    throw createError(400, 'Email and password are required');
  }

  return { email, password };
}

function signToken(userId) {
  return jwt.sign({ sub: userId }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: config.jwtExpiresIn,
  });
}

async function signup(req, res) {
  const { name, email, password } = readSignupInput(req.body);
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  try {
    // role is omitted so the database default USER is used. A role in the body is ignored.
    const result = await db.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, role, created_at`,
      [name, email, passwordHash]
    );

    res.status(201).json({ user: toPublicUser(result.rows[0]) });
  } catch (err) {
    // 23505 is PostgreSQL's unique_violation. The email unique constraint
    // is what makes this safe if two signups happen at the same time.
    if (err.code === '23505') {
      throw createError(409, 'An account with this email already exists');
    }
    throw err;
  }
}

async function login(req, res) {
  const { email, password } = readLoginInput(req.body);
  const result = await db.query(
    `SELECT id, name, email, password_hash, role, created_at
     FROM users
     WHERE email = $1`,
    [email]
  );
  const user = result.rows[0];

  // Same message for a missing account and a wrong password.
  const passwordMatches = user
    ? await bcrypt.compare(password, user.password_hash)
    : false;

  if (!user || !passwordMatches) {
    throw createError(401, 'Invalid email or password');
  }

  res.json({
    token: signToken(user.id),
    user: toPublicUser(user),
  });
}

async function me(req, res) {
  const result = await db.query(
    `SELECT id, name, email, role, created_at
     FROM users
     WHERE id = $1`,
    [req.userId]
  );
  const user = result.rows[0];

  if (!user) {
    throw createError(401, 'Invalid or expired token');
  }

  res.json({ user: toPublicUser(user) });
}

module.exports = {
  signup,
  login,
  me,
};

const db = require('../db');
const { createError, readPositiveInt, readRequiredText } = require('../utils');

function readDescription(value) {
  if (value == null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    throw createError(400, 'Description must be text');
  }
  const text = value.trim();
  return text.length ? text : null;
}

async function listTests(req, res) {
  const result = await db.query(
    `SELECT id, name, description
     FROM tests
     ORDER BY name`
  );

  res.json({ tests: result.rows });
}

async function createTest(req, res) {
  const body = req.body || {};
  const name = readRequiredText(body.name, 'Name', 150);
  const description = readDescription(body.description);
  const result = await db.query(
    `INSERT INTO tests (name, description)
     VALUES ($1, $2)
     RETURNING id, name, description`,
    [name, description]
  );

  res.status(201).json({ test: result.rows[0] });
}

async function updateTest(req, res) {
  const testId = readPositiveInt(req.params.id, 'Test id');
  const body = req.body || {};
  const hasName = Object.prototype.hasOwnProperty.call(body, 'name');
  const hasDescription = Object.prototype.hasOwnProperty.call(body, 'description');

  if (!hasName && !hasDescription) {
    throw createError(400, 'Name or description is required');
  }

  const existing = await db.query(
    'SELECT id, name, description FROM tests WHERE id = $1',
    [testId]
  );
  const test = existing.rows[0];
  if (!test) {
    throw createError(404, 'Test not found');
  }

  const name = hasName ? readRequiredText(body.name, 'Name', 150) : test.name;
  const description = hasDescription ? readDescription(body.description) : test.description;
  const result = await db.query(
    `UPDATE tests
     SET name = $1, description = $2
     WHERE id = $3
     RETURNING id, name, description`,
    [name, description, testId]
  );

  res.json({ test: result.rows[0] });
}

module.exports = {
  listTests,
  createTest,
  updateTest,
};

const db = require('../db');
const { createError, readPositiveInt, readRequiredText } = require('../utils');

function readPrice(value) {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    throw createError(400, 'Price must be a number with at most 2 decimal places');
  }
  if (Number(text) > 99999999.99) {
    throw createError(400, 'Price is too large');
  }
  return text;
}

async function listCentres(req, res) {
  const result = await db.query(
    `SELECT id, name, location
     FROM centres
     ORDER BY name`
  );

  res.json({ centres: result.rows });
}

async function createCentre(req, res) {
  const body = req.body || {};
  const name = readRequiredText(body.name, 'Name', 150);
  const location = readRequiredText(body.location, 'Location', 255);
  const result = await db.query(
    `INSERT INTO centres (name, location)
     VALUES ($1, $2)
     RETURNING id, name, location`,
    [name, location]
  );

  res.status(201).json({ centre: result.rows[0] });
}

async function updateCentre(req, res) {
  const centreId = readPositiveInt(req.params.id, 'Centre id');
  const body = req.body || {};
  const hasName = Object.prototype.hasOwnProperty.call(body, 'name');
  const hasLocation = Object.prototype.hasOwnProperty.call(body, 'location');

  if (!hasName && !hasLocation) {
    throw createError(400, 'Name or location is required');
  }

  const existing = await db.query(
    'SELECT id, name, location FROM centres WHERE id = $1',
    [centreId]
  );
  const centre = existing.rows[0];
  if (!centre) {
    throw createError(404, 'Centre not found');
  }

  const name = hasName ? readRequiredText(body.name, 'Name', 150) : centre.name;
  const location = hasLocation ? readRequiredText(body.location, 'Location', 255) : centre.location;
  const result = await db.query(
    `UPDATE centres
     SET name = $1, location = $2
     WHERE id = $3
     RETURNING id, name, location`,
    [name, location, centreId]
  );

  res.json({ centre: result.rows[0] });
}

async function setCentreTestPrice(req, res) {
  const centreId = readPositiveInt(req.params.centreId, 'Centre id');
  const testId = readPositiveInt(req.params.testId, 'Test id');
  const price = readPrice((req.body || {}).price);

  const centre = await db.query('SELECT id FROM centres WHERE id = $1', [centreId]);
  if (!centre.rows[0]) {
    throw createError(404, 'Centre not found');
  }
  const test = await db.query('SELECT id FROM tests WHERE id = $1', [testId]);
  if (!test.rows[0]) {
    throw createError(404, 'Test not found');
  }

  const result = await db.query(
    `INSERT INTO centre_tests (centre_id, test_id, price)
     VALUES ($1, $2, $3)
     ON CONFLICT (centre_id, test_id)
     DO UPDATE SET price = EXCLUDED.price
     RETURNING centre_id, test_id, price`,
    [centreId, testId, price]
  );
  const row = result.rows[0];

  res.json({
    centre_test: {
      centre_id: row.centre_id,
      test_id: row.test_id,
      price: Number(row.price),
    },
  });
}

async function getCentre(req, res) {
  const centreId = readPositiveInt(req.params.id, 'Centre id');

  const centreResult = await db.query(
    `SELECT id, name, location
     FROM centres
     WHERE id = $1`,
    [centreId]
  );
  const centre = centreResult.rows[0];

  if (!centre) {
    throw createError(404, 'Centre not found');
  }

  const testsResult = await db.query(
    `SELECT t.id, t.name, t.description, ct.price
     FROM centre_tests ct
     JOIN tests t ON t.id = ct.test_id
     WHERE ct.centre_id = $1
     ORDER BY t.name`,
    [centreId]
  );

  res.json({
    centre: {
      ...centre,
      tests: testsResult.rows.map((test) => ({
        id: test.id,
        name: test.name,
        description: test.description,
        // node-pg returns NUMERIC as a string. Send a JSON number instead.
        price: Number(test.price),
      })),
    },
  });
}

module.exports = {
  listCentres,
  getCentre,
  createCentre,
  updateCentre,
  setCentreTestPrice,
};

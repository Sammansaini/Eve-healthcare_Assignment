const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { Client } = require('pg');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

require('dotenv').config();

const devDatabaseUrl = process.env.DATABASE_URL;
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

function databaseName(connectionString) {
  const name = new URL(connectionString).pathname.replace(/^\//, '');
  return decodeURIComponent(name);
}

if (!testDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL is required. Create a separate database such as eve_healthcare_test. See the README.'
  );
}

const testDbName = databaseName(testDatabaseUrl);
if (!testDbName.endsWith('_test') || testDbName === 'eve_healthcare') {
  throw new Error(
    `Refusing to reset "${testDbName}". The test database name must end with _test and must not be eve_healthcare.`
  );
}
if (devDatabaseUrl && databaseName(devDatabaseUrl) === testDbName) {
  throw new Error('TEST_DATABASE_URL must not use the same database name as DATABASE_URL.');
}

process.env.DATABASE_URL = testDatabaseUrl;
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.WEBHOOK_SECRET = 'test-webhook-secret';

const app = require('../src/app');
const db = require('../src/db');

const root = path.join(__dirname, '..');
const webhookSecret = process.env.WEBHOOK_SECRET;

let server;
let baseUrl;
let sequence = 0;

function nextEmail(label) {
  sequence += 1;
  return `${label}.${sequence}@example.com`;
}

function futureAppointment() {
  return new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
}

async function applySchema() {
  const client = new Client({ connectionString: testDatabaseUrl });
  await client.connect();
  try {
    const current = await client.query('SELECT current_database() AS name');
    if (current.rows[0].name !== testDbName) {
      throw new Error(`Connected to ${current.rows[0].name}, expected ${testDbName}`);
    }
    for (const filename of [
      'reset_development_database.sql',
      'create_users_and_catalogue.sql',
      'seed_catalogue.sql',
      'create_bookings_and_payments.sql',
      'add_user_roles_and_webhook_events.sql',
    ]) {
      const sql = fs.readFileSync(path.join(root, 'sql', filename), 'utf8');
      await client.query(sql);
    }
  } finally {
    await client.end();
  }
}

async function api(urlPath, { method = 'GET', token, body, headers = {} } = {}) {
  const requestHeaders = { ...headers };
  if (token) {
    requestHeaders.Authorization = `Bearer ${token}`;
  }
  if (body !== undefined) {
    requestHeaders['Content-Type'] = 'application/json';
  }
  const response = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: response.status, json };
}

async function register(label) {
  const email = nextEmail(label);
  const signup = await api('/auth/signup', {
    method: 'POST',
    body: { name: label, email, password: 'password123', role: 'ADMIN' },
  });
  assert.equal(signup.status, 201);
  assert.equal(signup.json.user.role, 'USER');
  const login = await api('/auth/login', {
    method: 'POST',
    body: { email, password: 'password123' },
  });
  assert.equal(login.status, 200);
  return { email, token: login.json.token, user: signup.json.user };
}

async function book(token, centreId, testId, amount) {
  return api('/bookings', {
    method: 'POST',
    token,
    body: {
      centre_id: centreId,
      test_id: testId,
      appointment_at: futureAppointment(),
      amount,
    },
  });
}

function webhook(body, secret = webhookSecret) {
  const headers = {};
  if (secret !== null) {
    headers['X-Webhook-Secret'] = secret;
  }
  return api('/payments/webhook/', { method: 'POST', body, headers });
}

async function bookingState(bookingId) {
  const result = await db.query(
    `SELECT b.status AS booking_status,
            (SELECT count(*)::int FROM payments p WHERE p.booking_id = b.id) AS payment_count,
            (SELECT status FROM payments p WHERE p.booking_id = b.id) AS payment_status,
            (SELECT amount FROM payments p WHERE p.booking_id = b.id) AS payment_amount
     FROM bookings b
     WHERE b.id = $1`,
    [bookingId]
  );
  return result.rows[0];
}

async function eventRow(eventId) {
  const result = await db.query(
    'SELECT event_id, booking_id, status FROM webhook_events WHERE event_id = $1',
    [eventId]
  );
  return result.rows[0] || null;
}

describe('EVE Healthcare API', { concurrency: 1 }, () => {
  before(async () => {
    console.log(`Resetting test database ${testDbName}`);
    await applySchema();
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
    await db.pool.end();
  });

  it('signs up a normal user, logs in, and rejects bad credentials', async () => {
    const email = nextEmail('asha');
    const signup = await api('/auth/signup', {
      method: 'POST',
      body: { name: 'Asha Rao', email, password: 'password123', role: 'ADMIN' },
    });
    assert.equal(signup.status, 201);
    assert.equal(signup.json.user.role, 'USER');
    assert.equal(signup.json.user.password_hash, undefined);

    const duplicate = await api('/auth/signup', {
      method: 'POST',
      body: { name: 'Asha Rao', email, password: 'password123' },
    });
    assert.equal(duplicate.status, 409);

    const login = await api('/auth/login', {
      method: 'POST',
      body: { email, password: 'password123' },
    });
    assert.equal(login.status, 200);
    assert.ok(login.json.token);

    const wrongPassword = await api('/auth/login', {
      method: 'POST',
      body: { email, password: 'wrong-password' },
    });
    assert.equal(wrongPassword.status, 401);

    const me = await api('/auth/me', { token: login.json.token });
    assert.equal(me.status, 200);
    assert.equal(me.json.user.email, email);
    assert.equal(me.json.user.role, 'USER');

    const missingToken = await api('/auth/me');
    assert.equal(missingToken.status, 401);

    const bookings = await api('/bookings');
    assert.equal(bookings.status, 401);
  });

  it('keeps bookings private and copies the catalogue price', async () => {
    const owner = await register('owner');
    const other = await register('other');
    const created = await book(owner.token, 1, 1, 1);

    assert.equal(created.status, 201);
    assert.equal(created.json.booking.amount, 499);
    assert.equal(created.json.booking.status, 'PENDING');
    assert.equal(created.json.booking.user_id, owner.user.id);

    const ownBooking = await api(`/bookings/${created.json.booking.id}`, { token: owner.token });
    assert.equal(ownBooking.status, 200);

    const hidden = await api(`/bookings/${created.json.booking.id}`, { token: other.token });
    assert.equal(hidden.status, 403);
    assert.equal(hidden.json.booking, undefined);

    const otherList = await api('/bookings', { token: other.token });
    assert.equal(otherList.status, 200);
    assert.equal(otherList.json.bookings.length, 0);

    const notOffered = await book(owner.token, 1, 4);
    assert.equal(notOffered.status, 400);
  });

  it('records one successful or failed simulated payment and rejects a repeat', async () => {
    const user = await register('payer');
    const successBooking = await book(user.token, 1, 1, 5);
    const success = await api('/payments/', {
      method: 'POST',
      token: user.token,
      body: { booking_id: successBooking.json.booking.id, outcome: 'SUCCESS', amount: 1 },
    });
    assert.equal(success.status, 201);
    assert.equal(success.json.payment.status, 'SUCCESS');
    assert.equal(success.json.payment.amount, 499);
    assert.equal(success.json.booking.status, 'CONFIRMED');

    const repeat = await api('/payments/', {
      method: 'POST',
      token: user.token,
      body: { booking_id: successBooking.json.booking.id, outcome: 'SUCCESS' },
    });
    assert.equal(repeat.status, 409);
    const afterRepeat = await bookingState(successBooking.json.booking.id);
    assert.equal(afterRepeat.payment_count, 1);
    assert.equal(afterRepeat.booking_status, 'CONFIRMED');

    const failedBooking = await book(user.token, 1, 2);
    const failed = await api('/payments/', {
      method: 'POST',
      token: user.token,
      body: { booking_id: failedBooking.json.booking.id, outcome: 'FAILED' },
    });
    assert.equal(failed.status, 201);
    assert.equal(failed.json.payment.status, 'FAILED');
    assert.equal(failed.json.payment.amount, 899);
    assert.equal(failed.json.booking.status, 'FAILED');

    const other = await register('not-payer');
    const denied = await api('/payments/', {
      method: 'POST',
      token: other.token,
      body: { booking_id: failedBooking.json.booking.id, outcome: 'SUCCESS' },
    });
    assert.equal(denied.status, 403);
  });

  it('accepts a webhook, replays it, and rejects conflicting event data', async () => {
    const user = await register('webhook-user');
    const created = await book(user.token, 1, 1, 12);
    const bookingId = created.json.booking.id;
    const eventId = `evt-replay-${bookingId}`;

    const missingSecret = await webhook(
      { eventId, bookingId, status: 'SUCCESS' },
      null
    );
    assert.equal(missingSecret.status, 401);

    const wrongSecret = await webhook(
      { eventId, bookingId, status: 'SUCCESS' },
      'wrong-secret'
    );
    assert.equal(wrongSecret.status, 401);
    assert.equal(await eventRow(eventId), null);
    assert.equal((await bookingState(bookingId)).booking_status, 'PENDING');

    const first = await webhook({ eventId, bookingId, status: 'SUCCESS', amount: 1 });
    assert.equal(first.status, 200);
    assert.equal(first.json.already_processed, false);
    assert.equal(first.json.payment.amount, 499);
    assert.equal(first.json.payment.status, 'SUCCESS');
    assert.equal(first.json.booking.status, 'CONFIRMED');

    const replay = await webhook({ eventId, bookingId, status: 'SUCCESS' });
    assert.equal(replay.status, 200);
    assert.equal(replay.json.already_processed, true);
    assert.equal(replay.json.payment.id, first.json.payment.id);
    const afterReplay = await bookingState(bookingId);
    assert.equal(afterReplay.payment_count, 1);
    assert.equal(afterReplay.booking_status, 'CONFIRMED');

    const changed = await webhook({ eventId, bookingId, status: 'FAILED' });
    assert.equal(changed.status, 409);
    assert.equal((await bookingState(bookingId)).booking_status, 'CONFIRMED');
    assert.equal((await eventRow(eventId)).status, 'SUCCESS');

    const other = await book(user.token, 2, 1);
    const reusedOnAnotherBooking = await webhook({
      eventId,
      bookingId: other.json.booking.id,
      status: 'SUCCESS',
    });
    assert.equal(reusedOnAnotherBooking.status, 409);
    assert.equal((await bookingState(other.json.booking.id)).booking_status, 'PENDING');
    assert.equal((await bookingState(other.json.booking.id)).payment_count, 0);
  });

  it('treats an agreeing webhook as a duplicate and rejects a contradictory one', async () => {
    const user = await register('agree');
    const created = await book(user.token, 1, 3);
    const bookingId = created.json.booking.id;
    const paid = await api('/payments/', {
      method: 'POST',
      token: user.token,
      body: { booking_id: bookingId, outcome: 'SUCCESS' },
    });
    assert.equal(paid.status, 201);

    const agree = await webhook({ eventId: `evt-agree-${bookingId}`, bookingId, status: 'SUCCESS' });
    assert.equal(agree.status, 200);
    assert.equal(agree.json.already_processed, true);
    assert.equal((await bookingState(bookingId)).payment_count, 1);
    assert.equal((await bookingState(bookingId)).booking_status, 'CONFIRMED');

    const conflictId = `evt-conflict-${bookingId}`;
    const conflict = await webhook({ eventId: conflictId, bookingId, status: 'FAILED' });
    assert.equal(conflict.status, 409);
    assert.equal(await eventRow(conflictId), null);
    assert.equal((await bookingState(bookingId)).booking_status, 'CONFIRMED');
    assert.equal((await bookingState(bookingId)).payment_status, 'SUCCESS');
  });

  it('does not store two payments when two webhook events arrive together', async () => {
    const user = await register('parallel');
    const created = await book(user.token, 3, 4);
    const bookingId = created.json.booking.id;
    const [first, second] = await Promise.all([
      webhook({ eventId: `evt-a-${bookingId}`, bookingId, status: 'SUCCESS' }),
      webhook({ eventId: `evt-b-${bookingId}`, bookingId, status: 'SUCCESS' }),
    ]);

    assert.deepEqual([first.status, second.status].sort(), [200, 200]);
    const state = await bookingState(bookingId);
    assert.equal(state.payment_count, 1);
    assert.equal(state.booking_status, 'CONFIRMED');
    assert.equal(state.payment_amount, '399.00');
  });

  it('does not record a webhook that fails, including a cancelled booking', async () => {
    const user = await register('cancel');
    const created = await book(user.token, 2, 4);
    const bookingId = created.json.booking.id;
    const cancelled = await api(`/bookings/${bookingId}/cancel`, {
      method: 'POST',
      token: user.token,
    });
    assert.equal(cancelled.status, 200);

    const eventId = `evt-cancelled-${bookingId}`;
    const rejected = await webhook({ eventId, bookingId, status: 'SUCCESS' });
    assert.equal(rejected.status, 409);
    assert.equal(await eventRow(eventId), null);
    assert.equal((await bookingState(bookingId)).payment_count, 0);
    assert.equal((await bookingState(bookingId)).booking_status, 'CANCELLED');

    const next = await book(user.token, 2, 2);
    const reused = await webhook({
      eventId,
      bookingId: next.json.booking.id,
      status: 'FAILED',
    });
    assert.equal(reused.status, 200);
    assert.equal(reused.json.booking.status, 'FAILED');
    assert.equal((await eventRow(eventId)).booking_id, next.json.booking.id);

    const missingId = `evt-missing-${bookingId}`;
    const missing = await webhook({ eventId: missingId, bookingId: 99999, status: 'SUCCESS' });
    assert.equal(missing.status, 404);
    assert.equal(await eventRow(missingId), null);

    const badStatus = await webhook({ eventId: `evt-bad-${bookingId}`, bookingId, status: 'MAYBE' });
    assert.equal(badStatus.status, 400);
    assert.equal(await eventRow(`evt-bad-${bookingId}`), null);
  });

  it('lets only an admin change the catalogue', async () => {
    const user = await register('member');
    const denied = await api('/centres', {
      method: 'POST',
      token: user.token,
      body: { name: 'Blocked Centre', location: 'Nowhere' },
    });
    assert.equal(denied.status, 403);

    const output = execFileSync(process.execPath, ['scripts/promote-admin.js', user.email], {
      cwd: root,
      env: process.env,
      encoding: 'utf8',
    });
    assert.match(output, /ADMIN/);

    assert.throws(() => {
      execFileSync(process.execPath, ['scripts/promote-admin.js', 'missing@example.com'], {
        cwd: root,
        env: process.env,
        encoding: 'utf8',
      });
    });

    const createdCentre = await api('/centres', {
      method: 'POST',
      token: user.token,
      body: { name: 'EVE Diagnostics Whitefield', location: 'Whitefield, Bengaluru' },
    });
    assert.equal(createdCentre.status, 201);

    const updatedCentre = await api(`/centres/${createdCentre.json.centre.id}`, {
      method: 'PATCH',
      token: user.token,
      body: { location: 'Whitefield, Bengaluru' },
    });
    assert.equal(updatedCentre.status, 200);

    const createdTest = await api('/tests', {
      method: 'POST',
      token: user.token,
      body: { name: 'Vitamin D', description: 'Measures vitamin D.' },
    });
    assert.equal(createdTest.status, 201);

    const priced = await api(
      `/centres/${createdCentre.json.centre.id}/tests/${createdTest.json.test.id}`,
      {
        method: 'PUT',
        token: user.token,
        body: { price: 275.5 },
      }
    );
    assert.equal(priced.status, 200);
    assert.equal(priced.json.centre_test.price, 275.5);

    const negativePrice = await api(
      `/centres/${createdCentre.json.centre.id}/tests/${createdTest.json.test.id}`,
      {
        method: 'PUT',
        token: user.token,
        body: { price: -1 },
      }
    );
    assert.equal(negativePrice.status, 400);

    const visitor = await register('visitor');
    const visitorWrite = await api(
      `/centres/${createdCentre.json.centre.id}/tests/${createdTest.json.test.id}`,
      {
        method: 'PUT',
        token: visitor.token,
        body: { price: 10 },
      }
    );
    assert.equal(visitorWrite.status, 403);

    const publicCentres = await api('/centres');
    assert.equal(publicCentres.status, 200);
    assert.ok(publicCentres.json.centres.some((centre) => centre.id === createdCentre.json.centre.id));

    const booking = await book(
      visitor.token,
      createdCentre.json.centre.id,
      createdTest.json.test.id,
      1
    );
    assert.equal(booking.status, 201);
    assert.equal(booking.json.booking.amount, 275.5);
  });
});

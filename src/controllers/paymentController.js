const db = require('../db');
const { createError, readPositiveInt } = require('../utils');

const BOOKING_FIELDS = 'id, user_id, centre_id, test_id, appointment_at, amount, status, created_at';

const BOOKING_STATUS_FOR_OUTCOME = {
  SUCCESS: 'CONFIRMED',
  FAILED: 'FAILED',
};

const PAYMENT_ERRORS = {
  CONFIRMED: 'This booking has already been paid',
  FAILED: 'This booking already has a failed payment',
  CANCELLED: 'A cancelled booking cannot be paid',
};

function readEventId(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw createError(400, 'Event id is required');
  }
  const eventId = value.trim();
  if (eventId.length > 255) {
    throw createError(400, 'Event id must be 255 characters or fewer');
  }
  return eventId;
}

function toPublicBooking(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    centre_id: row.centre_id,
    test_id: row.test_id,
    appointment_at: row.appointment_at,
    amount: Number(row.amount),
    status: row.status,
    created_at: row.created_at,
  };
}

function toPublicPayment(row) {
  return {
    id: row.id,
    booking_id: row.booking_id,
    amount: Number(row.amount),
    status: row.status,
    created_at: row.created_at,
  };
}

async function loadPayment(client, bookingId) {
  const result = await client.query(
    `SELECT id, booking_id, amount, status, created_at
     FROM payments
     WHERE booking_id = $1`,
    [bookingId]
  );
  return result.rows[0] || null;
}

async function insertEvent(client, eventId, bookingId, status) {
  await client.query(
    `INSERT INTO webhook_events (event_id, booking_id, status)
     VALUES ($1, $2, $3)`,
    [eventId, bookingId, status]
  );
}

// Writes the one payment for a PENDING booking and moves the booking to its final status.
async function recordPayment(client, booking, outcome) {
  const paymentResult = await client.query(
    `INSERT INTO payments (booking_id, amount, status)
     VALUES ($1, $2, $3)
     RETURNING id, booking_id, amount, status, created_at`,
    [booking.id, booking.amount, outcome]
  );
  const bookingResult = await client.query(
    `UPDATE bookings
     SET status = $1
     WHERE id = $2
     RETURNING ${BOOKING_FIELDS}`,
    [BOOKING_STATUS_FOR_OUTCOME[outcome], booking.id]
  );

  return {
    payment: paymentResult.rows[0],
    booking: bookingResult.rows[0],
  };
}

async function createPayment(req, res) {
  const body = req.body || {};
  const bookingId = readPositiveInt(body.booking_id, 'Booking id');
  const outcome = body.outcome;

  if (!BOOKING_STATUS_FOR_OUTCOME[outcome]) {
    throw createError(400, 'Outcome must be SUCCESS or FAILED');
  }

  let saved;
  try {
    saved = await db.withTransaction(async (client) => {
      // FOR UPDATE makes a second payment request wait, then see the updated status.
      const bookingResult = await client.query(
        `SELECT ${BOOKING_FIELDS}
         FROM bookings
         WHERE id = $1
         FOR UPDATE`,
        [bookingId]
      );
      const booking = bookingResult.rows[0];

      if (!booking) {
        throw createError(404, 'Booking not found');
      }
      if (booking.user_id !== req.userId) {
        throw createError(403, 'You do not have access to this booking');
      }
      if (booking.status !== 'PENDING') {
        throw createError(409, PAYMENT_ERRORS[booking.status] || 'This booking cannot be paid');
      }

      const existingPayment = await loadPayment(client, bookingId);
      if (existingPayment) {
        throw createError(409, 'This booking already has a payment');
      }

      return recordPayment(client, booking, outcome);
    });
  } catch (err) {
    if (err.code === '23505') {
      throw createError(409, 'This booking already has a payment');
    }
    throw err;
  }

  res.status(201).json({
    payment: toPublicPayment(saved.payment),
    booking: toPublicBooking(saved.booking),
  });
}

async function applyWebhook(client, eventId, bookingId, status) {
  const bookingResult = await client.query(
    `SELECT ${BOOKING_FIELDS}
     FROM bookings
     WHERE id = $1
     FOR UPDATE`,
    [bookingId]
  );
  const booking = bookingResult.rows[0];
  if (!booking) {
    throw createError(404, 'Booking not found');
  }

  const eventResult = await client.query(
    `SELECT event_id, booking_id, status
     FROM webhook_events
     WHERE event_id = $1`,
    [eventId]
  );
  const existingEvent = eventResult.rows[0];

  if (existingEvent) {
    const sameEvent = Number(existingEvent.booking_id) === bookingId && existingEvent.status === status;
    if (!sameEvent) {
      throw createError(409, 'This event id was already used with different data');
    }
    const payment = await loadPayment(client, bookingId);
    if (!payment) {
      throw createError(409, 'This event was recorded without a payment');
    }
    return { payment, booking, alreadyProcessed: true };
  }

  if (booking.status === 'CANCELLED') {
    throw createError(409, 'A cancelled booking cannot be paid');
  }

  const payment = await loadPayment(client, bookingId);
  if (payment) {
    if (payment.status !== status) {
      throw createError(409, 'This event contradicts the existing payment');
    }

    let currentBooking = booking;
    const expectedStatus = BOOKING_STATUS_FOR_OUTCOME[status];
    if (booking.status !== expectedStatus) {
      if (booking.status !== 'PENDING') {
        throw createError(409, 'This event contradicts the booking status');
      }
      const updated = await client.query(
        `UPDATE bookings
         SET status = $1
         WHERE id = $2
         RETURNING ${BOOKING_FIELDS}`,
        [expectedStatus, booking.id]
      );
      currentBooking = updated.rows[0];
    }

    await insertEvent(client, eventId, bookingId, status);
    return { payment, booking: currentBooking, alreadyProcessed: true };
  }

  if (booking.status !== 'PENDING') {
    throw createError(409, 'This booking cannot be paid');
  }

  const saved = await recordPayment(client, booking, status);
  await insertEvent(client, eventId, bookingId, status);
  return { ...saved, alreadyProcessed: false };
}

async function runWebhook(eventId, bookingId, status) {
  try {
    return await db.withTransaction((client) => applyWebhook(client, eventId, bookingId, status));
  } catch (err) {
    // A unique violation aborts the transaction. Run it once more so the
    // saved event or payment can be treated as a replay or a conflict.
    if (err.code !== '23505') {
      throw err;
    }
  }

  try {
    return await db.withTransaction((client) => applyWebhook(client, eventId, bookingId, status));
  } catch (err) {
    if (err.code === '23505') {
      throw createError(409, 'This booking already has a payment');
    }
    throw err;
  }
}

async function handleWebhook(req, res) {
  const body = req.body || {};
  const eventId = readEventId(body.eventId);
  const bookingId = readPositiveInt(body.bookingId, 'Booking id');
  const status = body.status;

  if (!BOOKING_STATUS_FOR_OUTCOME[status]) {
    throw createError(400, 'Status must be SUCCESS or FAILED');
  }

  const saved = await runWebhook(eventId, bookingId, status);
  res.status(200).json({
    event_id: eventId,
    already_processed: saved.alreadyProcessed,
    payment: toPublicPayment(saved.payment),
    booking: toPublicBooking(saved.booking),
  });
}

module.exports = {
  createPayment,
  handleWebhook,
};

const db = require('../db');
const { createError, readPositiveInt } = require('../utils');

const BOOKING_FIELDS = 'id, user_id, centre_id, test_id, appointment_at, amount, status, created_at';

// Date and time, then Z or an offset such as +05:30.
const APPOINTMENT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

const CANCELLATION_ERRORS = {
  CONFIRMED: 'A paid booking cannot be cancelled',
  FAILED: 'A failed booking cannot be cancelled',
  CANCELLED: 'This booking is already cancelled',
};

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

function readAppointment(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw createError(400, 'Appointment date/time is required');
  }

  const appointment = value.trim();
  const match = appointment.match(APPOINTMENT_PATTERN);
  if (!match) {
    throw createError(
      400,
      'Appointment must include a timezone, such as 2027-01-15T09:30:00+05:30'
    );
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = match[6] ? Number(match[6]) : 0;
  const calendar = new Date(Date.UTC(year, month - 1, day));
  const validCalendar = calendar.getUTCFullYear() === year
    && calendar.getUTCMonth() === month - 1
    && calendar.getUTCDate() === day;

  if (!validCalendar || hour > 23 || minute > 59 || second > 59) {
    throw createError(400, 'Appointment date/time is not valid');
  }

  const parsed = new Date(appointment);
  if (Number.isNaN(parsed.getTime())) {
    throw createError(400, 'Appointment date/time is not valid');
  }
  if (parsed.getTime() <= Date.now()) {
    throw createError(400, 'Appointment must be in the future');
  }

  return appointment;
}

function assertOwner(booking, userId) {
  if (!booking) {
    throw createError(404, 'Booking not found');
  }
  if (booking.user_id !== userId) {
    throw createError(403, 'You do not have access to this booking');
  }
  return booking;
}

async function createBooking(req, res) {
  const body = req.body || {};
  const centreId = readPositiveInt(body.centre_id, 'Centre id');
  const testId = readPositiveInt(body.test_id, 'Test id');
  const appointmentAt = readAppointment(body.appointment_at);

  // The SELECT reads price from centre_tests. A price in the request is ignored.
  let result;
  try {
    result = await db.query(
      `INSERT INTO bookings (user_id, centre_id, test_id, appointment_at, amount)
       SELECT $1, centre_id, test_id, $2::timestamptz, price
       FROM centre_tests
       WHERE centre_id = $3 AND test_id = $4
       RETURNING ${BOOKING_FIELDS}`,
      [req.userId, appointmentAt, centreId, testId]
    );
  } catch (err) {
    if (err.code === '23503') {
      throw createError(400, 'Centre, test, or account is no longer available');
    }
    throw err;
  }

  const booking = result.rows[0];
  if (booking) {
    res.status(201).json({ booking: toPublicBooking(booking) });
    return;
  }

  const centre = await db.query('SELECT id FROM centres WHERE id = $1', [centreId]);
  if (!centre.rows[0]) {
    throw createError(404, 'Centre not found');
  }
  const test = await db.query('SELECT id FROM tests WHERE id = $1', [testId]);
  if (!test.rows[0]) {
    throw createError(404, 'Test not found');
  }
  throw createError(400, 'This centre does not offer the selected test');
}

async function listBookings(req, res) {
  const result = await db.query(
    `SELECT ${BOOKING_FIELDS}
     FROM bookings
     WHERE user_id = $1
     ORDER BY created_at DESC, id DESC`,
    [req.userId]
  );

  res.json({ bookings: result.rows.map(toPublicBooking) });
}

async function getBooking(req, res) {
  const bookingId = readPositiveInt(req.params.id, 'Booking id');
  const result = await db.query(
    `SELECT ${BOOKING_FIELDS}
     FROM bookings
     WHERE id = $1`,
    [bookingId]
  );

  const booking = assertOwner(result.rows[0], req.userId);
  res.json({ booking: toPublicBooking(booking) });
}

async function cancelBooking(req, res) {
  const bookingId = readPositiveInt(req.params.id, 'Booking id');

  const booking = await db.withTransaction(async (client) => {
    const result = await client.query(
      `SELECT ${BOOKING_FIELDS}
       FROM bookings
       WHERE id = $1
       FOR UPDATE`,
      [bookingId]
    );
    const current = assertOwner(result.rows[0], req.userId);

    if (current.status !== 'PENDING') {
      throw createError(
        409,
        CANCELLATION_ERRORS[current.status] || 'This booking cannot be cancelled'
      );
    }

    const updated = await client.query(
      `UPDATE bookings
       SET status = 'CANCELLED'
       WHERE id = $1
       RETURNING ${BOOKING_FIELDS}`,
      [bookingId]
    );
    return updated.rows[0];
  });

  res.json({ booking: toPublicBooking(booking) });
}

module.exports = {
  createBooking,
  listBookings,
  getBooking,
  cancelBooking,
};

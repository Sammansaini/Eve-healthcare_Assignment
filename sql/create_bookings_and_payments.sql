-- Adds bookings and payments.
-- Safe to run more than once. It does not drop tables or delete existing rows.

CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id),
  centre_id INTEGER NOT NULL REFERENCES centres (id),
  test_id INTEGER NOT NULL REFERENCES tests (id),
  appointment_at TIMESTAMPTZ NOT NULL,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- The pair must be a real offering. Price is copied into amount when the booking is created.
  FOREIGN KEY (centre_id, test_id) REFERENCES centre_tests (centre_id, test_id)
);

CREATE INDEX IF NOT EXISTS bookings_user_id_idx ON bookings (user_id);

-- booking_id is UNIQUE, so a booking can have only one payment row.
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER NOT NULL UNIQUE REFERENCES bookings (id),
  amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
  status VARCHAR(20) NOT NULL CHECK (status IN ('SUCCESS', 'FAILED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

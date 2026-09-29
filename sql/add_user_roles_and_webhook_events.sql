-- Adds the account role, for databases created before that column existed,
-- and the webhook event log.
-- Safe to run more than once. It does not drop tables or delete existing rows.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'USER';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_role_check CHECK (role IN ('USER', 'ADMIN'));
  END IF;
END $$;

-- event_id is unique, so the same provider event can be recognized on a replay.
CREATE TABLE IF NOT EXISTS webhook_events (
  event_id VARCHAR(255) PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES bookings (id),
  status VARCHAR(20) NOT NULL CHECK (status IN ('SUCCESS', 'FAILED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

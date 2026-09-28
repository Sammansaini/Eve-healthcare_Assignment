-- Creates accounts and the diagnostic catalogue.
-- Run this on an empty database. It does not drop tables or delete rows.
-- If these tables already exist, skip this file and run only the later file you still need.

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'USER' CONSTRAINT users_role_check CHECK (role IN ('USER', 'ADMIN')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE centres (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  location VARCHAR(255) NOT NULL
);

CREATE TABLE tests (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  description TEXT
);

-- A test can be offered by many centres, and a centre can offer many tests.
-- Price lives here because the same test can cost a different amount at each centre.
-- The primary key makes each (centre_id, test_id) pair unique.
CREATE TABLE centre_tests (
  centre_id INTEGER NOT NULL REFERENCES centres (id) ON DELETE CASCADE,
  test_id INTEGER NOT NULL REFERENCES tests (id) ON DELETE CASCADE,
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  PRIMARY KEY (centre_id, test_id)
);

-- The primary key already indexes centre_id. This index speeds up lookups by test.
CREATE INDEX centre_tests_test_id_idx ON centre_tests (test_id);

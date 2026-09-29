-- Sample centres, tests, and prices for local use.
-- Explicit ids keep the README examples stable. setval moves the sequences past them
-- so a later INSERT without an id does not collide with these rows.
-- Run this once after create_users_and_catalogue.sql. Running it again fails
-- if these ids already exist, which leaves the current prices unchanged.

INSERT INTO centres (id, name, location) VALUES
  (1, 'EVE Diagnostics Koramangala', 'Koramangala, Bengaluru'),
  (2, 'EVE Diagnostics Andheri', 'Andheri West, Mumbai'),
  (3, 'EVE Diagnostics Connaught Place', 'Connaught Place, New Delhi');

INSERT INTO tests (id, name, description) VALUES
  (1, 'Complete Blood Count', 'Measures red cells, white cells, and platelets.'),
  (2, 'Lipid Profile', 'Checks cholesterol and triglyceride levels.'),
  (3, 'Thyroid Profile', 'Measures TSH, T3, and T4.'),
  (4, 'HbA1c', 'Shows average blood sugar over about three months.');

INSERT INTO centre_tests (centre_id, test_id, price) VALUES
  (1, 1, 499.00),
  (1, 2, 899.00),
  (1, 3, 699.00),
  (2, 1, 549.00),
  (2, 2, 799.00),
  (2, 4, 450.00),
  (3, 1, 525.00),
  (3, 3, 750.00),
  (3, 4, 399.00);

SELECT setval(pg_get_serial_sequence('centres', 'id'), (SELECT MAX(id) FROM centres));
SELECT setval(pg_get_serial_sequence('tests', 'id'), (SELECT MAX(id) FROM tests));

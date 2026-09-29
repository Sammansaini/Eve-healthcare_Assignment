-- Development and test reset. Running this deletes every application table and its rows.
-- Use it only on a database you are willing to rebuild.
-- Afterward, run 001, seed_catalogue.sql, 002, and 003.

DROP TABLE IF EXISTS webhook_events;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS bookings;
DROP TABLE IF EXISTS centre_tests;
DROP TABLE IF EXISTS tests;
DROP TABLE IF EXISTS centres;
DROP TABLE IF EXISTS users;

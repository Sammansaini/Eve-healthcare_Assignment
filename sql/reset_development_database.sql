-- Development and test reset. Running this deletes every application table and its rows.
-- Use it only on a database you are willing to rebuild.
-- Afterward, run create_users_and_catalogue.sql, seed_catalogue.sql,
-- create_bookings_and_payments.sql, and add_user_roles_and_webhook_events.sql.

DROP TABLE IF EXISTS webhook_events;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS bookings;
DROP TABLE IF EXISTS centre_tests;
DROP TABLE IF EXISTS tests;
DROP TABLE IF EXISTS centres;
DROP TABLE IF EXISTS users;

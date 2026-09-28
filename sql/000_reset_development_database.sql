-- Development reset. Running this deletes the account and catalogue tables.
-- Use it only on a database you are willing to rebuild.
-- Afterward, run 001_create_users_and_catalogue.sql and seed_catalogue.sql.

DROP TABLE IF EXISTS centre_tests;
DROP TABLE IF EXISTS tests;
DROP TABLE IF EXISTS centres;
DROP TABLE IF EXISTS users;

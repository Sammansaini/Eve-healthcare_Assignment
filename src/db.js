const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool({
  connectionString: config.databaseUrl,
});

// Pass user input as params. pg sends those values separately from the SQL text,
// so they cannot change the query itself.
function query(text, params) {
  return pool.query(text, params);
}

module.exports = {
  query,
  pool,
};

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

// Run several statements on one connection. COMMIT saves them together.
// ROLLBACK undoes them if any statement fails, including a locked payment attempt.
async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Rollback failed', rollbackErr);
    }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  query,
  withTransaction,
  pool,
};

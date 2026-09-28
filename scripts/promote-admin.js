require('dotenv').config();
const { Client } = require('pg');

const email = (process.argv[2] || '').trim().toLowerCase();

if (!email) {
  console.error('Usage: node scripts/promote-admin.js <email>');
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

async function main() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query(
      `UPDATE users
       SET role = 'ADMIN'
       WHERE email = $1
       RETURNING id, email, role`,
      [email]
    );
    const user = result.rows[0];
    if (!user) {
      console.error(`No user found with email ${email}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Promoted ${user.email} to ${user.role}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

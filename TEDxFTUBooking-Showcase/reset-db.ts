import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function reset() {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres; GRANT ALL ON SCHEMA public TO public;');
  console.log('Database reset successfully.');
  process.exit(0);
}

reset().catch(e => {
  console.error(e);
  process.exit(1);
});

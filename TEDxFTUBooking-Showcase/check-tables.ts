import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  try {
    const res = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);
    
    const countRes = await pool.query(`
      SELECT 
        (SELECT count(*) FROM events) as events_count,
        (SELECT count(*) FROM seats) as seats_count,
        (SELECT count(*) FROM users) as users_count
    `);
    
    console.log('TABLES:', res.rows.map(r => r.table_name).join(', '));
    console.log('COUNTS:', countRes.rows[0]);
  } catch (e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
check();

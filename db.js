import pg from 'pg';
const { Pool } = pg;

// Render's managed Postgres needs SSL — this auto-detects a Render
// connection string, so you don't need to configure anything manually.
// (You can still force it with PGSSL=true in Environment Variables.)
const isRenderDb = (process.env.DATABASE_URL || '').includes('render.com');

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: (process.env.PGSSL === 'true' || isRenderDb) ? { rejectUnauthorized: false } : false,
});

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kv_store (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  console.log('DB ready ✓');
}

export async function kvGet(key) {
  const res = await pool.query('SELECT value FROM kv_store WHERE key = $1', [key]);
  return res.rows[0] ? res.rows[0].value : null;
}

export async function kvSet(key, value) {
  await pool.query(
    `INSERT INTO kv_store (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
    [key, JSON.stringify(value)]
  );
}

export async function kvList(prefix) {
  const res = await pool.query('SELECT key FROM kv_store WHERE key LIKE $1', [prefix + '%']);
  return res.rows.map((r) => r.key);
}

export async function kvDelete(key) {
  await pool.query('DELETE FROM kv_store WHERE key = $1', [key]);
}


# KARTHIK×CORE — Render Deploy Steps (phone-only, no PC needed)

Your repo already has the right files (`package.json`, `server.js`, `db.js`,
`public/index.html`). Just do these two things first:

1. **Delete** `DEPLOY-STEPS-RAILWAY.md` from the repo (not needed anymore).
2. **Replace** `db.js` with the updated version below (Render needs SSL —
   this version auto-detects it, so you don't have to configure anything).

```javascript
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
```

---

## 1. Create the PostgreSQL database on Render
1. Render dashboard → **New +** → **PostgreSQL**
2. Name it (e.g. `karthik-core-db`) → choose the **Free** instance type → **Create Database**
3. Wait for it to finish provisioning, then open it and copy the
   **Internal Database URL** (you'll use this in step 3).

## 2. Create the web service
1. Render dashboard → **New +** → **Web Service**
2. Connect your GitHub repo (the one with `server.js` etc.)
3. Settings:
   - **Root Directory**: leave blank
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free is fine to start

## 3. Connect the database to the web service
1. On the web service → **Environment** tab → **Add Environment Variable**
2. Key: `DATABASE_URL`
   Value: paste the **Internal Database URL** you copied in step 1
3. Save — Render will redeploy automatically.

## 4. Done
- Your site is live at the `.onrender.com` URL Render gives you.
- Visit it → you'll hit the access gate.
- To generate your first key: open `https://<your-domain>/#admin`, enter
  `Karthik#1234`, and use **"Manually Issue a Key"**.

## Notes
- Free-tier Render web services sleep after inactivity — first request after
  a while will take ~30-50 seconds to wake up. Normal, not a bug.
- The `kv_store` table is created automatically on first boot — no manual
  SQL needed.
- Admin password lives in `server.js` (top of file) — change it anytime by
  editing that file in GitHub; Render redeploys automatically on push.
- The 4 chat "modes" (PULSE/NOVA/APEX/ECHO) call your friend's endpoints
  server-side — nothing about the underlying APIs is exposed to visitors.


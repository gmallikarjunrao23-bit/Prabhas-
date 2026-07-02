# KARTHIK×CORE — Railway Deploy Steps (phone-only, no PC needed)

## 1. Upload to GitHub (web UI)
Create a **new repo** (e.g. `karthik-core`), then use "Add file → Create new file"
and paste each path exactly as shown — GitHub auto-creates the folders:

- `package.json`
- `server.js`
- `db.js`
- `public/index.html`
- `.gitignore`

## 2. Create the project on Railway
1. Railway dashboard → **New Project → Deploy from GitHub repo**
2. Select `karthik-core`
3. Railway auto-detects Node.js and runs `npm install` + `npm start`.

## 3. Add PostgreSQL (this replaces the "KV" storage)
1. In the same Railway project → **New → Database → Add PostgreSQL**
2. Open your **web service** (not the DB) → **Variables** tab
3. Add a new variable: `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   (Railway shows this reference variable when you click "Add Variable Reference")
4. Redeploy the web service if it doesn't restart automatically.

## 4. Generate a public domain
1. Web service → **Settings → Networking → Generate Domain**
2. You'll get something like `karthik-core-production.up.railway.app`

## 5. Done
- Visit your domain → you'll hit the access gate.
- To generate your first key: open `https://<your-domain>/#admin`, enter
  `Karthik#1234`, and use **"Manually Issue a Key"**.

## Notes
- The `kv_store` table is created automatically on first boot — no manual
  SQL needed.
- The admin password lives in `server.js` (top of file) — change it anytime
  by editing that file in GitHub; Railway redeploys automatically on push.
- If Postgres connection fails with an SSL error, add a variable
  `PGSSL` = `true` in the web service's Variables tab and redeploy.
- The 4 chat "modes" (PULSE/NOVA/APEX/ECHO) call your friend's endpoints
  server-side — nothing about the underlying APIs is exposed to visitors.


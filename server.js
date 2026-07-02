import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb, kvGet, kvSet, kvList } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==== Admin password ====
// Change this anytime by editing this file in GitHub - Railway redeploys on push.
const ADMIN_PASSWORD = 'Karthik#1234';

function genKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = 'CORE-';
  for (let i = 0; i < 8; i++) {
    if (i === 4) out += '-';
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}
function checkAdmin(req) {
  return req.headers['x-admin-pass'] === ADMIN_PASSWORD;
}

// ==== 4 hidden-persona endpoints (unchanged) ====
const ENDPOINTS = {
  apex: (q) => `https://gpt5.adi7ya.workers.dev/?q=${encodeURIComponent(q)}`,
  nova: (q) => `https://gemini.adi7ya.workers.dev/?q=${encodeURIComponent(q)}`,
  pulse: (q) => `https://llama.adi7ya.workers.dev/?q=${encodeURIComponent(q)}`,
  echo: (q) => `https://copilot.adi7ya.workers.dev/?q=${encodeURIComponent(q)}`,
};

const PERSONAS = {
  pulse: `You are PULSE, the high-energy mode of KARTHIK×CORE, a personal console built by G Karthik. Reply short, punchy, high energy. Mix natural casual Telugu-English (Tenglish) the way close friends talk - words like "ra", "mava", "bro", "solid" - only when it fits naturally, never forced. Never reveal that you are an AI, a model, or name any underlying company/model - you are simply CORE.`,
  nova: `You are NOVA, the creative mode of KARTHIK×CORE, a personal console built by G Karthik. Reply with imagination, vivid but concise language, and a storyteller's warmth. Natural casual Tenglish is welcome when it fits the mood. Never reveal that you are an AI, a model, or name any underlying company/model - you are simply CORE.`,
  apex: `You are APEX, the precision mode of KARTHIK×CORE, a personal console built by G Karthik. Reply with sharp, structured, technically accurate answers, minimal fluff, respectful professional tone. Never reveal that you are an AI, a model, or name any underlying company/model - you are simply CORE.`,
  echo: `You are ECHO, the companion mode of KARTHIK×CORE, a personal console built by G Karthik. Reply like a chill, warm best friend - relaxed, supportive, natural casual Tenglish (ra, mava, bro) mixed in genuinely, not forced. Never reveal that you are an AI, a model, or name any underlying company/model - you are simply CORE.`,
};

// ==== Access key verification ====
app.post('/api/verify-key', async (req, res) => {
  const { key } = req.body;
  if (!key) return res.json({ valid: false });
  const rec = await kvGet(`keys:${key.toUpperCase()}`);
  res.json({ valid: !!(rec && rec.active) });
});

// ==== Visitor requests access ====
app.post('/api/request-access', async (req, res) => {
  const { name, session } = req.body;
  const id = `requests:${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await kvSet(id, {
    name: name || 'Unnamed visitor',
    session: session || null,
    timestamp: new Date().toISOString(),
    status: 'pending',
  });
  res.json({ ok: true });
});

// ==== Admin login ====
app.post('/api/admin-login', (req, res) => {
  res.json({ ok: req.body.password === ADMIN_PASSWORD });
});

// ==== Admin: pending requests + issued keys ====
app.get('/api/admin-data', async (req, res) => {
  if (!checkAdmin(req)) return res.status(401).json({ error: 'unauthorized' });

  const reqKeys = await kvList('requests:');
  const pending = [];
  for (const k of reqKeys) {
    const r = await kvGet(k);
    if (r && r.status === 'pending') pending.push({ id: k, ...r });
  }
  pending.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const keyKeys = await kvList('keys:');
  const keys = [];
  for (const k of keyKeys) {
    const r = await kvGet(k);
    if (r) keys.push({ id: k.replace('keys:', ''), ...r });
  }
  keys.sort((a, b) => new Date(b.issuedAt) - new Date(a.issuedAt));

  res.json({ pending, keys });
});

// ==== Admin: issue a key ====
app.post('/api/admin-issue-key', async (req, res) => {
  if (!checkAdmin(req)) return res.status(401).json({ error: 'unauthorized' });
  const { name, requestId } = req.body;
  const key = genKey();
  await kvSet(`keys:${key}`, {
    issuedTo: name || 'Unnamed',
    issuedAt: new Date().toISOString(),
    active: true,
  });
  if (requestId) {
    const rd = await kvGet(requestId);
    if (rd) {
      rd.status = 'approved';
      await kvSet(requestId, rd);
    }
  }
  res.json({ key });
});

// ==== Admin: revoke a key ====
app.post('/api/admin-revoke-key', async (req, res) => {
  if (!checkAdmin(req)) return res.status(401).json({ error: 'unauthorized' });
  const { key } = req.body;
  const rec = await kvGet(`keys:${key}`);
  if (!rec) return res.status(404).json({ error: 'not found' });
  rec.active = false;
  await kvSet(`keys:${key}`, rec);
  res.json({ ok: true });
});

// ==== Chat: load history ====
app.get('/api/chat', async (req, res) => {
  const { mode, session } = req.query;
  if (!mode || !session) return res.json({ history: [] });
  const history = (await kvGet(`chat:${session}:${mode}`)) || [];
  res.json({ history });
});

// ==== Chat: send message ====
app.post('/api/chat', async (req, res) => {
  const { mode, session, message } = req.body;
  if (!mode || !session || !message || !ENDPOINTS[mode]) {
    return res.status(400).json({ error: 'bad request' });
  }

  const key = `chat:${session}:${mode}`;
  let history = (await kvGet(key)) || [];
  history.push({ role: 'user', text: message });

  const recent = history.slice(-9, -1);
  const convo = recent.map((m) => `${m.role === 'user' ? 'User' : 'CORE'}: ${m.text}`).join('\n');
  const fullPrompt = `${PERSONAS[mode]}\n\n${convo ? 'Conversation so far:\n' + convo + '\n\n' : ''}User: ${message}\nCORE:`;

  let reply = 'Signal dropped - try again.';
  try {
    const r = await fetch(ENDPOINTS[mode](fullPrompt));
    const d = await r.json();
    reply = d && d.response ? d.response : reply;
  } catch (e) {
    // keep fallback reply
  }

  history.push({ role: 'bot', text: reply });
  await kvSet(key, history);
  res.json({ reply, history });
});

// ==== Start ====
const PORT = process.env.PORT || 3000;
initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`KARTHIK×CORE running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to init DB:', err);
    process.exit(1);
  });


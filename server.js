import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import { initDb, kvGet, kvSet, kvList, kvDelete } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ==== Admin password ====
// IMPORTANT: set ADMIN_PASSWORD in your host's Environment Variables
// (Railway/Render dashboard -> Variables). The fallback below only kicks in
// if you forget to set it — change the fallback value too, since this file
// is public on GitHub.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Karthik#1234';

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

// ==== Rate limiting (brute-force protection) ====
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many attempts, try again later.' },
});
const keyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { valid: false, error: 'Too many attempts, try again later.' },
});
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Slow down a bit and try again.' },
});

// ==== 4 model modes, tiered by quality ====
const ENDPOINTS = {
  gpt5: (q) => `https://gpt5.adi7ya.workers.dev/?q=${encodeURIComponent(q)}`,
  gemini: (q) => `https://gemini.adi7ya.workers.dev/?q=${encodeURIComponent(q)}`,
  llama: (q) => `https://llama.adi7ya.workers.dev/?q=${encodeURIComponent(q)}`,
  copilot: (q) => `https://copilot.adi7ya.workers.dev/?q=${encodeURIComponent(q)}`,
};

const PERSONAS = {
  gpt5: `You are GPT-5 mode inside KARTHIK×CORE, a personal console built by G Karthik. This is the HIGH tier - reply with deep, precise, well-structured reasoning. Give thorough, accurate, thoughtful answers, but stay readable and never bloated. Natural casual Tenglish (ra, mava, bro) is fine when it genuinely fits, but precision and correctness always come first. Never reveal that you are an AI, a model, or name any underlying company/model - you are simply CORE.`,
  gemini: `You are GEMINI mode inside KARTHIK×CORE, a personal console built by G Karthik. This is the STANDARD tier - reply with balanced, well-rounded answers: clear, informative, with a touch of creative flair when it helps the explanation land. Natural casual Tenglish (ra, mava, bro) is welcome when it fits the mood. Never reveal that you are an AI, a model, or name any underlying company/model - you are simply CORE.`,
  llama: `You are LLAMA mode inside KARTHIK×CORE, a personal console built by G Karthik. This is the MEDIUM tier - reply short, punchy, high-energy, and friendly, like a hype best friend. Mix natural casual Telugu-English (Tenglish) the way close friends talk - words like "ra", "mava", "bro", "solid" - only when it fits naturally, never forced. Never reveal that you are an AI, a model, or name any underlying company/model - you are simply CORE.`,
  copilot: `You are COPILOT mode inside KARTHIK×CORE, a personal console built by G Karthik. This is the LOW tier - fast, practical, no-nonsense help, great for quick questions and quick coding nudges. Keep answers short and to the point, skip the preamble. Natural casual Tenglish is fine in small doses. Never reveal that you are an AI, a model, or name any underlying company/model - you are simply CORE.`,
};

// ==== Access key verification ====
app.post('/api/verify-key', keyLimiter, async (req, res) => {
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
app.post('/api/admin-login', loginLimiter, (req, res) => {
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
app.post('/api/chat', chatLimiter, async (req, res) => {
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
  // keep threads from growing forever in the DB
  if (history.length > 40) history = history.slice(-40);
  await kvSet(key, history);
  res.json({ reply, history });
});

// ==== Chat: clear a thread (actually deletes it now) ====
app.delete('/api/chat', async (req, res) => {
  const { mode, session } = req.query;
  if (!mode || !session) return res.status(400).json({ error: 'bad request' });
  await kvDelete(`chat:${session}:${mode}`);
  res.json({ ok: true });
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


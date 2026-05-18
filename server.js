import express from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'texts.json');
const MAX_TEXT_BYTES = Number(process.env.MAX_TEXT_BYTES || 1024 * 1024 * 2); // 2 MB
const ADMIN_KEY = process.env.ADMIN_KEY || '';

app.disable('x-powered-by');
app.use(express.json({ limit: `${Math.ceil(MAX_TEXT_BYTES / 1024)}kb` }));
app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html'],
  maxAge: '1h',
}));

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, '{}\n', 'utf8');
  }
}

async function readStore() {
  await ensureStore();
  const raw = await fs.readFile(DATA_FILE, 'utf8');
  return JSON.parse(raw || '{}');
}

async function writeStore(store) {
  await ensureStore();
  const tmp = `${DATA_FILE}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), 'utf8');
  await fs.rename(tmp, DATA_FILE);
}

function makeId(bytes = 6) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function hashSecret(secret) {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

function publicItem(id, item, includeText = false) {
  const base = {
    id,
    title: item.title || 'Untitled',
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    expiresAt: item.expiresAt || null,
    textBytes: Buffer.byteLength(item.text || '', 'utf8'),
  };
  if (includeText) base.text = item.text || '';
  return base;
}

function isExpired(item) {
  return item.expiresAt && Date.now() > Date.parse(item.expiresAt);
}

async function pruneExpired(store) {
  let changed = false;
  for (const [id, item] of Object.entries(store)) {
    if (isExpired(item)) {
      delete store[id];
      changed = true;
    }
  }
  if (changed) await writeStore(store);
  return changed;
}

app.get('/api/texts', async (_req, res, next) => {
  try {
    const store = await readStore();
    await pruneExpired(store);
    const items = Object.entries(store)
      .map(([id, item]) => publicItem(id, item))
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

app.get('/api/texts/:id', async (req, res, next) => {
  try {
    const store = await readStore();
    const item = store[req.params.id];
    if (!item || isExpired(item)) {
      if (item) {
        delete store[req.params.id];
        await writeStore(store);
      }
      return res.status(404).json({ error: 'not_found' });
    }
    res.json(publicItem(req.params.id, item, true));
  } catch (error) {
    next(error);
  }
});

app.post('/api/texts', async (req, res, next) => {
  try {
    const { title = '', text = '', ttlHours = 0, adminKey = '' } = req.body || {};
    if (ADMIN_KEY && adminKey !== ADMIN_KEY) {
      return res.status(401).json({ error: 'bad_admin_key' });
    }
    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'empty_text' });
    }
    const textBytes = Buffer.byteLength(text, 'utf8');
    if (textBytes > MAX_TEXT_BYTES) {
      return res.status(413).json({ error: 'text_too_large', maxBytes: MAX_TEXT_BYTES });
    }

    const store = await readStore();
    await pruneExpired(store);
    let id;
    do {
      id = makeId();
    } while (store[id]);

    const deleteToken = makeId(18);
    const now = new Date().toISOString();
    const ttl = Number(ttlHours);
    const expiresAt = Number.isFinite(ttl) && ttl > 0
      ? new Date(Date.now() + ttl * 60 * 60 * 1000).toISOString()
      : null;

    store[id] = {
      title: String(title || '').trim().slice(0, 120),
      text,
      createdAt: now,
      updatedAt: now,
      expiresAt,
      deleteTokenHash: hashSecret(deleteToken),
    };
    await writeStore(store);
    res.status(201).json({ ...publicItem(id, store[id], true), deleteToken });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/texts/:id', async (req, res, next) => {
  try {
    const { deleteToken = '', adminKey = '' } = req.body || {};
    const store = await readStore();
    const item = store[req.params.id];
    if (!item) return res.status(404).json({ error: 'not_found' });

    const tokenOk = deleteToken && hashSecret(deleteToken) === item.deleteTokenHash;
    const adminOk = ADMIN_KEY && adminKey === ADMIN_KEY;
    if (!tokenOk && !adminOk) {
      return res.status(403).json({ error: 'bad_delete_token' });
    }

    delete store[req.params.id];
    await writeStore(store);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'server_error' });
});

app.listen(PORT, () => {
  console.log(`Text Drop listening on http://localhost:${PORT}`);
});

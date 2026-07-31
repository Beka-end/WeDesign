// api/_lib.js — общие серверные утилиты WeDesign.
// Здесь нет ни одного секрета в коде: всё берётся из переменных окружения Vercel.

const crypto = require('crypto');

/* ------------------------------------------------------------------ */
/* Хранилище: Upstash Redis через REST (без npm-пакетов).              */
/* Если переменные не заданы — работает временная память (для теста).   */
/* ------------------------------------------------------------------ */

const KV_URL =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const KV_TOKEN =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

const hasKV = Boolean(KV_URL && KV_TOKEN);
const mem = new Map();
const memZ = new Map();
const memS = new Map();

function memAlive(key) {
  const rec = mem.get(key);
  if (!rec) return null;
  if (rec.exp && rec.exp < Date.now()) {
    mem.delete(key);
    return null;
  }
  return rec;
}

async function cmd(args) {
  const r = await fetch(KV_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error('storage_error_' + r.status);
  const data = await r.json();
  return data.result;
}

const store = {
  async get(key) {
    if (!hasKV) {
      const rec = memAlive(key);
      return rec ? rec.v : null;
    }
    return await cmd(['GET', key]);
  },
  async set(key, value, ttlSeconds) {
    if (!hasKV) {
      mem.set(key, {
        v: value,
        exp: ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0,
      });
      return 'OK';
    }
    const args = ['SET', key, value];
    if (ttlSeconds) args.push('EX', String(ttlSeconds));
    return await cmd(args);
  },
  async del(key) {
    if (!hasKV) return mem.delete(key) ? 1 : 0;
    return await cmd(['DEL', key]);
  },
  // Счётчик с автосбросом — основа лимитов.
  async incr(key, ttlSeconds) {
    if (!hasKV) {
      const rec = memAlive(key);
      const next = (rec ? Number(rec.v) : 0) + 1;
      mem.set(key, {
        v: next,
        exp: rec && rec.exp ? rec.exp : Date.now() + ttlSeconds * 1000,
      });
      return next;
    }
    const n = await cmd(['INCR', key]);
    if (n === 1 && ttlSeconds) await cmd(['EXPIRE', key, String(ttlSeconds)]);
    return n;
  },
  async sadd(key, member) {
    if (!hasKV) {
      const s = memS.get(key) || new Set();
      const added = s.has(member) ? 0 : 1;
      s.add(member);
      memS.set(key, s);
      return added;
    }
    return await cmd(['SADD', key, member]);
  },
  async sismember(key, member) {
    if (!hasKV) return (memS.get(key) || new Set()).has(member) ? 1 : 0;
    return await cmd(['SISMEMBER', key, member]);
  },
  async srem(key, member) {
    if (!hasKV) {
      const s = memS.get(key);
      return s && s.delete(member) ? 1 : 0;
    }
    return await cmd(['SREM', key, member]);
  },
  async zadd(key, score, member) {
    if (!hasKV) {
      const z = memZ.get(key) || [];
      const i = z.findIndex((x) => x.m === member);
      if (i >= 0) z[i].s = score;
      else z.push({ s: score, m: member });
      memZ.set(key, z);
      return 1;
    }
    return await cmd(['ZADD', key, String(score), member]);
  },
  async zrem(key, member) {
    if (!hasKV) {
      const z = memZ.get(key) || [];
      memZ.set(
        key,
        z.filter((x) => x.m !== member)
      );
      return 1;
    }
    return await cmd(['ZREM', key, member]);
  },
  // Свежие сверху.
  async zrecent(key, limit) {
    if (!hasKV) {
      const z = (memZ.get(key) || []).slice().sort((a, b) => b.s - a.s);
      return z.slice(0, limit).map((x) => x.m);
    }
    return await cmd(['ZRANGE', key, '0', String(limit - 1), 'REV']);
  },
};

/* ------------------------------------------------------------------ */
/* JSON-обёртки                                                         */
/* ------------------------------------------------------------------ */

async function getJSON(key) {
  const raw = await store.get(key);
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

async function setJSON(key, value, ttlSeconds) {
  return store.set(key, JSON.stringify(value), ttlSeconds);
}

/* ------------------------------------------------------------------ */
/* Запрос / ответ                                                       */
/* ------------------------------------------------------------------ */

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.headers['x-real-ip'] || '0.0.0.0';
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) {
    try {
      return JSON.parse(req.body);
    } catch (e) {
      return {};
    }
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (e) {
    return {};
  }
}

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function fail(res, status, message) {
  return send(res, status, { ok: false, error: message });
}

/* ------------------------------------------------------------------ */
/* Лимиты — защита денег на API-ключе                                   */
/* ------------------------------------------------------------------ */

const DAY = 24 * 60 * 60;

async function limit(key, max, ttlSeconds) {
  const used = await store.incr(key, ttlSeconds);
  return { ok: used <= max, used, max };
}

function num(name, fallback) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/* ------------------------------------------------------------------ */
/* Токены админа: подпись HMAC, ключ никогда не покидает сервер         */
/* ------------------------------------------------------------------ */

function secret() {
  return (
    process.env.ADMIN_SECRET ||
    process.env.ADMIN_PASSWORD ||
    'wedesign-insecure-default'
  );
}

function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function signAdminToken(hours) {
  const exp = Date.now() + (hours || 8) * 60 * 60 * 1000;
  const payload = b64url(JSON.stringify({ exp }));
  const sig = b64url(
    crypto.createHmac('sha256', secret()).update(payload).digest()
  );
  return `${payload}.${sig}`;
}

function verifyAdminToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return false;
  const [payload, sig] = token.split('.');
  const expected = b64url(
    crypto.createHmac('sha256', secret()).update(payload).digest()
  );
  const a = Buffer.from(sig || '');
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  if (!crypto.timingSafeEqual(a, b)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
    return data.exp > Date.now();
  } catch (e) {
    return false;
  }
}

function samePassword(input) {
  const real = process.env.ADMIN_PASSWORD || '';
  if (!real) return false;
  const a = crypto.createHash('sha256').update(String(input)).digest();
  const b = crypto.createHash('sha256').update(real).digest();
  return crypto.timingSafeEqual(a, b);
}

async function requireAdmin(req, res) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!verifyAdminToken(token)) {
    fail(res, 401, 'Нужен вход в панель');
    return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Мелочи                                                               */
/* ------------------------------------------------------------------ */

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function code(len) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function clean(value, maxLen) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
    .slice(0, maxLen || 200);
}

function slugify(value) {
  const map = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
    и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
    с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch',
    ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', і: 'i', ә: 'a', ғ: 'g',
    қ: 'k', ң: 'n', ө: 'o', ұ: 'u', ү: 'u', һ: 'h',
  };
  return String(value || '')
    .toLowerCase()
    .split('')
    .map((ch) => (map[ch] !== undefined ? map[ch] : ch))
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'site';
}

module.exports = {
  store,
  getJSON,
  setJSON,
  clientIp,
  readBody,
  send,
  fail,
  limit,
  num,
  DAY,
  signAdminToken,
  verifyAdminToken,
  samePassword,
  requireAdmin,
  code,
  esc,
  clean,
  slugify,
  hasKV,
};

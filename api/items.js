const crypto = require('crypto');

const ARCHIVE_KEY = 'release-simulator:items:v1';
const MAX_ITEMS = 500;
const MAX_IMAGE_LENGTH = 2_800_000;
const MAX_REQUEST_LENGTH = 3_200_000;
const WRITE_LIMIT_PER_MINUTE = 12;
const ALLOWED_ORIGINS = new Set([
  'https://donquixoteee1.github.io',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
]);

function setCors(req, res) {
  const origin = req.headers.origin;
  const vercelOrigins = [
    process.env.VERCEL_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL
  ].filter(Boolean).map(host => `https://${host}`);
  const ownVercelOrigin = typeof origin === 'string' && vercelOrigins.includes(origin);
  const allowed = !origin || ALLOWED_ORIGINS.has(origin) || ownVercelOrigin;
  if (origin && allowed) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Vary', 'Origin');
  return allowed;
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function cleanText(value, fallback, maxLength) {
  const normalized = String(value ?? '').trim().replace(/\s+/g, ' ');
  return (normalized || fallback).slice(0, maxLength);
}

function cleanDataUrl(value) {
  if (typeof value !== 'string' || !value.startsWith('data:image/png;base64,')) return null;
  if (value.length > MAX_IMAGE_LENGTH) throw new Error('Drawing is too large');
  return value;
}

function normalizeItem(input) {
  const id = `item-${Date.now()}-${crypto.randomBytes(5).toString('hex')}`;
  const dataUrl = cleanDataUrl(input.dataUrl);
  return {
    id,
    mine: false,
    name: cleanText(input.name, 'Unnamed object', 80),
    city: cleanText(input.city, 'Somewhere', 60),
    date: new Date().toISOString().slice(0, 10),
    kept: cleanText(input.kept, 'It stayed because memory made it heavier than its use.', 600),
    reason: cleanText(input.reason, 'It can continue without being owned.', 600),
    note: cleanText(input.note, 'Go lightly.', 300),
    dataUrl,
    variant: dataUrl ? null : 'object',
    createdAt: new Date().toISOString()
  };
}

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('Cloud database is not configured');
  return { url:url.replace(/\/$/, ''), token };
}

async function redisCommand(...command) {
  const { url, token } = redisConfig();
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(command)
  });
  if (!response.ok) throw new Error(`Database request failed (${response.status})`);
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

async function redisPipeline(commands) {
  const { url, token } = redisConfig();
  const response = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(commands)
  });
  if (!response.ok) throw new Error(`Database request failed (${response.status})`);
  const data = await response.json();
  const failure = Array.isArray(data) && data.find(result => result?.error);
  if (failure) throw new Error(failure.error);
  return data;
}

function clientAddress(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket?.remoteAddress || 'unknown';
}

async function enforceWriteLimit(req) {
  const minute = Math.floor(Date.now() / 60_000);
  const addressHash = crypto.createHash('sha256').update(clientAddress(req)).digest('hex').slice(0, 16);
  const key = `release-simulator:rate:${minute}:${addressHash}`;
  const count = Number(await redisCommand('INCR', key));
  if (count === 1) await redisCommand('EXPIRE', key, 75);
  if (count > WRITE_LIMIT_PER_MINUTE) {
    const error = new Error('Too many releases. Please try again in a minute.');
    error.statusCode = 429;
    throw error;
  }
}

function parseBody(req) {
  const declaredLength = Number(req.headers['content-length'] || 0);
  if (declaredLength > MAX_REQUEST_LENGTH) {
    const error = new Error('Payload too large');
    error.statusCode = 413;
    throw error;
  }
  let input;
  if (typeof req.body === 'string') input = JSON.parse(req.body || '{}');
  else if (Buffer.isBuffer(req.body)) input = JSON.parse(req.body.toString('utf8') || '{}');
  else input = req.body && typeof req.body === 'object' ? req.body : {};
  if (JSON.stringify(input).length > MAX_REQUEST_LENGTH) {
    const error = new Error('Payload too large');
    error.statusCode = 413;
    throw error;
  }
  return input;
}

async function listItems() {
  const serialized = await redisCommand('ZREVRANGE', ARCHIVE_KEY, 0, MAX_ITEMS - 1);
  if (!Array.isArray(serialized)) return [];
  return serialized.flatMap(value => {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? [parsed] : [];
    } catch {
      return [];
    }
  });
}

async function saveItem(input) {
  const item = normalizeItem(input);
  await redisPipeline([
    ['ZADD', ARCHIVE_KEY, Date.now(), JSON.stringify(item)],
    ['ZREMRANGEBYRANK', ARCHIVE_KEY, 0, -(MAX_ITEMS + 1)]
  ]);
  return item;
}

module.exports = async function handler(req, res) {
  const corsAllowed = setCors(req, res);

  if (req.method === 'OPTIONS') {
    res.statusCode = corsAllowed ? 204 : 403;
    return res.end();
  }
  if (!corsAllowed) return sendJson(res, 403, { error:'Origin not allowed' });

  try {
    if (req.method === 'GET') {
      return sendJson(res, 200, { items:await listItems() });
    }
    if (req.method === 'POST') {
      await enforceWriteLimit(req);
      const item = await saveItem(parseBody(req));
      return sendJson(res, 201, { item });
    }
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return sendJson(res, 405, { error:'Method not allowed' });
  } catch (error) {
    const status = error.statusCode || (error.message === 'Cloud database is not configured' ? 503 : 500);
    return sendJson(res, status, { error:error.message || 'Unexpected server error' });
  }
};

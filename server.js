const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'items.json');
const clients = new Set();

const galaxies = {
  unfinished: {
    name: '未完成星系',
    keywords: ['未完成', '没读完', '没有读完', '没织完', '未读完', '半途', '作品', '手稿', '书', '围巾', '草稿', '计划', 'notebook', 'book']
  },
  relationship: {
    name: '旧关系星系',
    keywords: ['礼物', '纪念', '前任', '共同', '一起', '家具', '合照', '关系', '朋友', '家人', 'gift', 'souvenir']
  },
  impulse: {
    name: '冲动消费带',
    keywords: ['冲动', '没用', '几乎没有', '买来', '全新', '闲置', '购物', '商品', 'unused', 'shopping']
  },
  childhood: {
    name: '童年轨道',
    keywords: ['童年', '小时候', '玩具', '校服', '日记', '本子', '娃娃', 'toy', 'diary', 'school']
  },
  broken: {
    name: '故障卫星区',
    keywords: ['坏', '故障', '充不了电', '屏幕', '电子', '相机', '耳机', '手机', '键盘', 'broken', 'camera', 'headphone']
  },
  nameless: {
    name: '无名尘埃',
    keywords: ['不想说', '不解释', '无名', '不知道', '随便', '空白', 'none', 'unknown', 'unnamed']
  }
};

const galaxyAnchors = {
  unfinished: { x: 1020, y: 780, color: '#c5a3ff' },
  relationship: { x: 2140, y: 820, color: '#ff8a76' },
  impulse: { x: 2660, y: 1540, color: '#ffd166' },
  childhood: { x: 940, y: 1740, color: '#65a6ff' },
  broken: { x: 1900, y: 1900, color: '#53d18a' },
  nameless: { x: 1780, y: 1260, color: '#f6f3ea' }
};

function ensureStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(seedItems(), null, 2));
  }
}

function readItems() {
  ensureStore();
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeItems(items) {
  ensureStore();
  fs.writeFileSync(DATA_FILE, JSON.stringify(items.slice(-500), null, 2));
}

function seedItems() {
  const seeds = [
    {
      name: 'Porcelain cup', city: 'Hangzhou',
      kept: 'It stayed on the desk through several apartments.',
      reason: 'The handle broke, and the morning it belonged to has ended.',
      note: 'Thank you for keeping my hands warm.', variant: 'cup'
    },
    {
      name: 'Soft toy', city: 'Chengdu',
      kept: 'A childhood witness, too tender to throw away.',
      reason: 'It can become memory without occupying a shelf.',
      note: 'Sleep elsewhere now.', variant: 'toy'
    },
    {
      name: 'Old headphones', city: 'Shanghai',
      kept: 'They carried a private archive of train rides.',
      reason: 'Silence feels more accurate now.',
      note: 'Release the songs.', variant: 'headphones'
    },
    {
      name: 'Notebook', city: 'Guangzhou',
      kept: 'Unfinished plans made it feel alive.',
      reason: 'Some futures do not need storage.',
      note: 'Remain open.', variant: 'book'
    },
    {
      name: 'Small ring', city: 'Beijing',
      kept: 'It was proof that a promise once had weight.',
      reason: 'The proof is no longer required.',
      note: 'Orbit without me.', variant: 'ring'
    }
  ];
  return seeds.map((item, index) => normalizeItem(item, `sample-${index + 1}`, true));
}

function classifyGalaxy(item) {
  const text = `${item.name || ''} ${item.kept || ''} ${item.reason || ''} ${item.note || ''}`.toLowerCase();
  let best = { key: 'nameless', score: 0 };
  for (const [key, value] of Object.entries(galaxies)) {
    const score = value.keywords.reduce((sum, kw) => sum + (text.includes(kw.toLowerCase()) ? 1 : 0), 0);
    if (score > best.score) best = { key, score };
  }
  return best.score ? best.key : 'nameless';
}

function visualFor(item, id) {
  const galaxy = item.galaxy || classifyGalaxy(item);
  const anchor = galaxyAnchors[galaxy] || galaxyAnchors.nameless;
  const hash = crypto.createHash('sha1').update(id).digest();
  const n = (i) => hash[i] / 255;
  const angle = n(0) * Math.PI * 2;
  const radius = 120 + n(1) * 380;
  return {
    x: Math.round(anchor.x + Math.cos(angle) * radius),
    y: Math.round(anchor.y + Math.sin(angle) * radius),
    size: Math.round(104 + n(2) * 58),
    driftRadius: Math.round(26 + n(3) * 76),
    driftSpeed: +(0.000035 + n(4) * 0.00006).toFixed(7),
    orbitPhase: +(n(5) * Math.PI * 2).toFixed(4),
    rotationSpeed: +(0.003 + n(6) * 0.012).toFixed(4),
    wobble: +(0.2 + n(7) * 0.8).toFixed(3),
    color: anchor.color,
    galaxy,
    constellationId: `${galaxy}-${Math.floor(n(8) * 4) + 1}`
  };
}

function normalizeItem(input, forcedId, seed = false) {
  const id = forcedId || `item-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const base = {
    id,
    mine: false,
    name: String(input.name || 'Unnamed object').slice(0, 80),
    city: String(input.city || 'Somewhere').slice(0, 60),
    date: input.date || new Date().toISOString().slice(0, 10),
    kept: String(input.kept || 'It stayed because memory made it heavier than its use.').slice(0, 600),
    reason: String(input.reason || 'It can continue without being owned.').slice(0, 600),
    note: String(input.note || 'Go lightly.').slice(0, 300),
    dataUrl: typeof input.dataUrl === 'string' && input.dataUrl.startsWith('data:image/') ? input.dataUrl : null,
    variant: input.variant || (input.dataUrl ? null : 'object')
  };
  base.galaxy = input.galaxy || classifyGalaxy(base);
  base.galaxyName = galaxies[base.galaxy].name;
  base.visual = input.visual || visualFor(base, id);
  if (seed) base.seed = true;
  return base;
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 6_000_000) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function broadcast(item) {
  const payload = `event: item\ndata: ${JSON.stringify(item)}\n\n`;
  for (const res of clients) res.write(payload);
}

function serveFile(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const file = path.normalize(path.join(ROOT, pathname));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(file);
    const type = ext === '.html' ? 'text/html; charset=utf-8' : ext === '.js' ? 'application/javascript' : ext === '.json' ? 'application/json' : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === 'GET' && url.pathname === '/api/items') {
      return sendJson(res, 200, { items: readItems() });
    }
    if (req.method === 'POST' && url.pathname === '/api/items') {
      const raw = await readBody(req);
      const input = JSON.parse(raw || '{}');
      const item = normalizeItem(input);
      const items = readItems();
      items.push(item);
      writeItems(items);
      broadcast(item);
      return sendJson(res, 201, { item });
    }
    if (req.method === 'GET' && url.pathname === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive'
      });
      res.write('event: hello\ndata: {}\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    serveFile(req, res);
  } catch (err) {
    sendJson(res, err.message === 'Payload too large' ? 413 : 500, { error: err.message });
  }
});

ensureStore();
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Release Simulator server listening on ${PORT}`);
});

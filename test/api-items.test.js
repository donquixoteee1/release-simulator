const test = require('node:test');
const assert = require('node:assert/strict');

process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
process.env.VERCEL_URL = 'release-simulator-api.vercel.app';

const handler = require('../api/items');

function request(method, { origin='https://donquixoteee1.github.io', body, headers={} } = {}) {
  return {
    method,
    body,
    headers:{
      origin,
      'x-forwarded-for':'203.0.113.10',
      ...headers
    },
    socket:{ remoteAddress:'203.0.113.10' }
  };
}

function response() {
  return {
    statusCode:200,
    headers:{},
    body:'',
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(value='') {
      this.body = value;
    }
  };
}

function redisResult(result) {
  return {
    ok:true,
    status:200,
    json:async () => ({ result })
  };
}

test('GET returns shared archive items with GitHub Pages CORS headers', async () => {
  const item = { id:'item-1', name:'Old cup' };
  global.fetch = async (_url, options) => {
    assert.deepEqual(JSON.parse(options.body), ['ZREVRANGE', 'release-simulator:items:v1', 0, 499]);
    return redisResult([JSON.stringify(item)]);
  };

  const res = response();
  await handler(request('GET'), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['access-control-allow-origin'], 'https://donquixoteee1.github.io');
  assert.deepEqual(JSON.parse(res.body), { items:[item] });
});

test('POST validates, rate limits, and persists a normalized item', async () => {
  const calls = [];
  global.fetch = async (url, options) => {
    const command = JSON.parse(options.body);
    calls.push({ url, command });
    if (url.endsWith('/pipeline')) {
      return {
        ok:true,
        status:200,
        json:async () => [{ result:1 }, { result:0 }]
      };
    }
    if (command[0] === 'INCR') return redisResult(1);
    if (command[0] === 'EXPIRE') return redisResult(1);
    throw new Error(`Unexpected command: ${command[0]}`);
  };

  const res = response();
  await handler(request('POST', {
    body:{
      name:'  Old   cup  ',
      kept:'A memory',
      reason:'Time to go',
      note:'Goodbye',
      dataUrl:'data:image/png;base64,AAAA'
    }
  }), res);

  assert.equal(res.statusCode, 201);
  const saved = JSON.parse(res.body).item;
  assert.match(saved.id, /^item-\d+-[a-f0-9]{10}$/);
  assert.equal(saved.name, 'Old cup');
  assert.equal(saved.mine, false);
  assert.equal(saved.variant, null);
  const pipeline = calls.find(call => call.url.endsWith('/pipeline'));
  assert.equal(pipeline.command[0][0], 'ZADD');
  assert.equal(pipeline.command[1][0], 'ZREMRANGEBYRANK');
});

test('requests from unknown origins are rejected before database access', async () => {
  let called = false;
  global.fetch = async () => {
    called = true;
    return redisResult([]);
  };

  const res = response();
  await handler(request('GET', { origin:'https://malicious.example' }), res);

  assert.equal(res.statusCode, 403);
  assert.equal(called, false);
});

test('OPTIONS preflight is handled without touching the database', async () => {
  let called = false;
  global.fetch = async () => {
    called = true;
    return redisResult([]);
  };

  const res = response();
  await handler(request('OPTIONS'), res);

  assert.equal(res.statusCode, 204);
  assert.equal(called, false);
});

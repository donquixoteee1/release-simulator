const test = require('node:test');
const assert = require('node:assert/strict');

const originalFetch = global.fetch;
const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const originalSiteUrl = process.env.URL;

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test.afterEach(() => {
  global.fetch = originalFetch;
  restoreEnv('UPSTASH_REDIS_REST_URL', originalUrl);
  restoreEnv('UPSTASH_REDIS_REST_TOKEN', originalToken);
  restoreEnv('URL', originalSiteUrl);
});

test('Netlify adapter exposes the shared archive at the same origin', async () => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
  process.env.URL = 'https://release-simulator-cn.netlify.app';
  global.fetch = async () => ({
    ok:true,
    json:async () => ({ result:[] })
  });

  const { handler } = require('../netlify/functions/items');
  const response = await handler({
    httpMethod:'GET',
    headers:{ origin:process.env.URL },
    body:null,
    isBase64Encoded:false
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['Access-Control-Allow-Origin'], process.env.URL);
  assert.deepEqual(JSON.parse(response.body), { items:[] });
});

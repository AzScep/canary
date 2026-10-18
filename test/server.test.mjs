import assert from 'node:assert/strict';
import net from 'node:net';
import { after, before, describe, test } from 'node:test';
import { startServer } from './helpers.mjs';

const SECRET = 'canary-secret-value-that-must-never-leave';

describe('with its setting and secret', () => {
  let server;
  before(async () => { server = await startServer({ CANARY_GREETING: 'Hello <from> canary', CANARY_SECRET: SECRET }); });
  after(() => server.stop());

  test('status reports the setting and that the secret is present', async () => {
    const response = await fetch(`${server.url}/status.json`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), {
      app: 'canary',
      setting: { name: 'CANARY_GREETING', present: true, value: 'Hello <from> canary' },
      secret: { name: 'CANARY_SECRET', present: true },
    });
  });

  test('the page shows the setting escaped and the secret only as present', async () => {
    const response = await fetch(server.url);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^text\/html; charset=utf-8$/);
    assert.match(response.headers.get('content-security-policy'), /default-src 'none'/);
    const html = await response.text();
    assert.match(html, /Hello &lt;from&gt; canary/);
    assert.match(html, /<dd id="secret">present<\/dd>/);
  });

  test('the secret value never appears in any response or log', async () => {
    for (const path of ['/', '/status.json', '/healthz', '/missing']) {
      const response = await fetch(`${server.url}${path}`);
      const text = await response.text();
      assert.ok(!text.includes(SECRET), `${path} leaked the secret`);
      assert.ok(![...response.headers.values()].some((value) => value.includes(SECRET)), `${path} leaked the secret in a header`);
    }
    assert.ok(!server.output().includes(SECRET), 'the log leaked the secret');
  });

  test('health answers ok', async () => {
    const response = await fetch(`${server.url}/healthz`);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'ok\n');
  });

  test('a request target URL cannot parse is a 404 and the server keeps serving', async () => {
    for (const target of ['//', '//[', 'http://[']) {
      const reply = await new Promise((resolve, reject) => {
        const socket = net.connect(new URL(server.url).port, '127.0.0.1');
        let data = '';
        socket.on('data', (chunk) => { data += chunk; });
        socket.on('end', () => resolve(data));
        socket.on('error', reject);
        socket.write(`GET ${target} HTTP/1.1\r\nHost: canary\r\nConnection: close\r\n\r\n`);
      });
      assert.match(reply, /^HTTP\/1\.1 (400|404) /, target);
    }
    assert.equal((await fetch(`${server.url}/healthz`)).status, 200);
  });

  test('unknown paths are 404 and other methods are 405', async () => {
    assert.equal((await fetch(`${server.url}/missing`)).status, 404);
    const post = await fetch(`${server.url}/status.json`, { method: 'POST' });
    assert.equal(post.status, 405);
    assert.equal(post.headers.get('allow'), 'GET, HEAD');
    assert.equal((await fetch(`${server.url}/status.json`, { method: 'HEAD' })).status, 200);
  });
});

describe('without config', () => {
  let server;
  before(async () => { server = await startServer({ CANARY_GREETING: '   ' }); });
  after(() => server.stop());

  test('still starts and reports a blank setting and the secret as missing', async () => {
    const response = await fetch(`${server.url}/status.json`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      app: 'canary',
      setting: { name: 'CANARY_GREETING', present: false, value: null },
      secret: { name: 'CANARY_SECRET', present: false },
    });
    const html = await (await fetch(server.url)).text();
    assert.match(html, /<dd id="setting" class="missing">missing<\/dd>/);
    assert.match(html, /<dd id="secret" class="missing">missing<\/dd>/);
  });
});

test('stops cleanly on SIGTERM', async () => {
  const server = await startServer({});
  const code = await server.stop();
  assert.equal(code, 0);
});

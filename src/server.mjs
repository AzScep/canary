// The canary: the platform's permanent test app. It reports its one setting and whether its one
// secret was delivered, so the smoke gate proves config delivery on every deploy. The secret's
// value is read only to test that it is non-empty; it never enters a response or a log.
import http from 'node:http';

const SETTING = 'CANARY_GREETING';
const SECRET = 'CANARY_SECRET';

function config() {
  const setting = (process.env[SETTING] ?? '').trim();
  return {
    app: 'canary',
    setting: { name: SETTING, present: setting !== '', value: setting === '' ? null : setting },
    secret: { name: SECRET, present: (process.env[SECRET] ?? '').trim() !== '' },
  };
}

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}

const MISSING = (id) => `<dd id="${id}" class="missing">missing</dd>`;

function page({ setting, secret }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Canary</title>
<style>
body { font: 16px/1.5 system-ui, sans-serif; margin: 0; padding: 2rem 1rem; background: #f7f7f5; color: #1c1c1a; }
main { max-width: 32rem; margin: 0 auto; }
h1 { font-size: 1.5rem; margin: 0 0 1rem; }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.25rem 1rem; margin: 0; }
dt { color: #5c5c58; }
dd { margin: 0; overflow-wrap: anywhere; }
.missing { color: #b42318; font-weight: 600; }
@media (prefers-color-scheme: dark) { body { background: #1c1c1a; color: #ececea; } dt { color: #a3a39e; } .missing { color: #ff8a7a; } }
</style>
</head>
<body>
<main>
<h1>Canary</h1>
<dl>
<dt>${SETTING}</dt>${setting.present ? `<dd id="setting">${escapeHtml(setting.value)}</dd>` : MISSING('setting')}
<dt>${SECRET}</dt>${secret.present ? '<dd id="secret">present</dd>' : MISSING('secret')}
</dl>
</main>
</body>
</html>
`;
}

const baseHeaders = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

function send(request, response, status, type, body, extra = {}) {
  response.writeHead(status, { ...baseHeaders, 'content-type': type, 'content-length': Buffer.byteLength(body), ...extra });
  response.end(request.method === 'HEAD' ? undefined : body);
}

const server = http.createServer((request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    send(request, response, 405, 'text/plain; charset=utf-8', 'method not allowed\n', { allow: 'GET, HEAD' });
    return;
  }
  const { pathname } = new URL(request.url, 'http://canary');
  if (pathname === '/') {
    send(request, response, 200, 'text/html; charset=utf-8', page(config()), {
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    });
  } else if (pathname === '/status.json') {
    send(request, response, 200, 'application/json', `${JSON.stringify(config())}\n`);
  } else if (pathname === '/healthz') {
    send(request, response, 200, 'text/plain; charset=utf-8', 'ok\n');
  } else {
    send(request, response, 404, 'text/plain; charset=utf-8', 'not found\n');
  }
});

server.listen(Number(process.env.PORT ?? 8080), () => {
  const { setting, secret } = config();
  console.log(`canary listening on port ${server.address().port}; ${SETTING} ${setting.present ? 'set' : 'missing'}, ${SECRET} ${secret.present ? 'present' : 'missing'}`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));

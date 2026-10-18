// The canary's smoke gate, compiled from the feature map in .claude/skills/verify/features/.
// The platform runs it as `node smoke/smoke.mjs` with only built-in modules and three variables:
//   SMOKE_BASE_URL     the canary's URL (http or https)
//   SMOKE_ENVIRONMENT  ci or production
//   SMOKE_IMAGE        the image digest under test, printed for the run log
// It exits 0 only when every check passed, 1 when a check failed, and 2 on a usage error.
// switches.json beside it can fail production smoke on purpose to exercise automatic rollback.
import { readFileSync } from 'node:fs';

const ENVIRONMENTS = ['ci', 'production'];
const REQUEST_TIMEOUT_MS = 5_000;
const READY_TIMEOUT_MS = Number(process.env.SMOKE_READY_TIMEOUT_MS ?? 60_000);

function usage(message) {
  console.error(`usage error: ${message}`);
  process.exit(2);
}

const baseUrl = process.env.SMOKE_BASE_URL ?? '';
const environment = process.env.SMOKE_ENVIRONMENT ?? '';
const image = process.env.SMOKE_IMAGE || 'unknown';
let base;
try {
  base = new URL(baseUrl);
} catch {
  usage('SMOKE_BASE_URL must be an http or https URL');
}
if (!['http:', 'https:'].includes(base.protocol)) usage('SMOKE_BASE_URL must be an http or https URL');
if (!ENVIRONMENTS.includes(environment)) usage(`SMOKE_ENVIRONMENT must be one of ${ENVIRONMENTS.join(', ')}`);

const url = (path) => new URL(path, base).href;
const failures = [];
const pass = (name) => console.log(`ok ${name}`);
const fail = (name, reason) => {
  failures.push(name);
  console.log(`FAIL ${name}: ${reason}`);
};

function readSwitches() {
  try {
    const switches = JSON.parse(readFileSync(new URL('switches.json', import.meta.url), 'utf8'));
    const keys = switches && typeof switches === 'object' && !Array.isArray(switches) ? Object.keys(switches) : [];
    if (keys.length === 1 && keys[0] === 'failProductionSmoke' && typeof switches.failProductionSmoke === 'boolean') return switches;
  } catch { /* reported below */ }
  return null;
}

async function get(path) {
  return fetch(url(path), { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), redirect: 'error', headers: { 'cache-control': 'no-cache' } });
}

async function waitUntilReachable() {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let last = 'no response';
  do {
    try {
      const response = await get('/healthz');
      if (response.ok && (await response.text()) === 'ok\n') return true;
      last = `status ${response.status}`;
    } catch (error) {
      last = error.cause?.code ?? error.name;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  } while (Date.now() < deadline);
  fail('reachable', `no answer from ${url('/healthz')} within ${READY_TIMEOUT_MS} ms (${last})`);
  return false;
}

console.log(`canary smoke (${environment}) against ${base.origin}, image ${image}`);

const switches = readSwitches();
if (switches === null) {
  fail('switches', 'smoke/switches.json must be exactly { "failProductionSmoke": true | false }');
} else if (environment === 'production' && switches.failProductionSmoke) {
  fail('deliberate production failure', 'failProductionSmoke is on in smoke/switches.json');
}

const CHECKS = 4;
if (await waitUntilReachable()) {
  pass('reachable');

  // Feature: config delivery (features/config-delivery.md).
  let status = null;
  try {
    const response = await get('/status.json');
    if (response.status === 200) status = await response.json();
    else fail('status', `status.json answered ${response.status}`);
  } catch (error) {
    fail('status', `status.json is unreadable (${error.name})`);
  }
  if (status) {
    if (status.setting?.name === 'CANARY_GREETING' && status.setting.present === true && typeof status.setting.value === 'string' && status.setting.value.trim() !== '') {
      pass('setting delivered');
    } else {
      fail('setting delivered', 'CANARY_GREETING is missing');
    }
    if (status.secret?.name === 'CANARY_SECRET' && status.secret.present === true && Object.keys(status.secret).length === 2) {
      pass('secret delivered');
    } else {
      fail('secret delivered', 'CANARY_SECRET is missing');
    }
  }

  // Feature: status page (features/status-page.md).
  try {
    const response = await get('/');
    const html = await response.text();
    if (response.status === 200 && html.includes('<dd id="secret">present</dd>') && !html.includes('class="missing"')) {
      pass('status page');
    } else {
      fail('status page', `the page answered ${response.status} without the delivered config`);
    }
  } catch (error) {
    fail('status page', `the page is unreadable (${error.name})`);
  }
}

if (failures.length === 0) {
  console.log(`smoke passed: ${CHECKS} checks`);
} else {
  console.log(`smoke failed: ${failures.join(', ')}`);
  process.exitCode = 1;
}

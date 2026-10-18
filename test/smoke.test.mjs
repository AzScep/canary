import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { root, runSmoke, startServer } from './helpers.mjs';

const SMOKE = 'smoke/smoke.mjs';
const IMAGE = `ghcr.io/azscep/canary@sha256:${'a'.repeat(64)}`;
const configured = { CANARY_GREETING: 'Hello from canary', CANARY_SECRET: 'not-shown' };

// A copy of the suite with its switch file rewritten, the way a commit that flips it would look.
function suiteWithSwitches(content) {
  const directory = mkdtempSync(path.join(tmpdir(), 'canary-smoke-'));
  cpSync(path.join(root, 'smoke'), directory, { recursive: true });
  writeFileSync(path.join(directory, 'switches.json'), content);
  return { script: path.join(directory, 'smoke.mjs'), remove: () => rmSync(directory, { recursive: true, force: true }) };
}

test('the committed switch leaves production smoke passing', () => {
  assert.deepEqual(JSON.parse(readFileSync(path.join(root, 'smoke/switches.json'), 'utf8')), { failProductionSmoke: false });
});

describe('against a configured canary', () => {
  let server;
  before(async () => { server = await startServer(configured); });
  after(() => server.stop());

  for (const environment of ['ci', 'production']) {
    test(`passes in ${environment}`, async () => {
      const result = await runSmoke(SMOKE, { SMOKE_BASE_URL: server.url, SMOKE_ENVIRONMENT: environment, SMOKE_IMAGE: IMAGE });
      assert.equal(result.code, 0, result.output);
      assert.match(result.output, /smoke passed: 4 checks/);
      assert.match(result.output, new RegExp(`image ${IMAGE.replace(/[.@]/g, '\\$&')}`));
    });
  }

  test('the switch fails production smoke on purpose and leaves CI smoke passing', async (t) => {
    const suite = suiteWithSwitches('{ "failProductionSmoke": true }\n');
    t.after(suite.remove);
    const production = await runSmoke(suite.script, { SMOKE_BASE_URL: server.url, SMOKE_ENVIRONMENT: 'production', SMOKE_IMAGE: IMAGE });
    assert.equal(production.code, 1, production.output);
    assert.match(production.output, /FAIL deliberate production failure: failProductionSmoke is on/);
    const ci = await runSmoke(suite.script, { SMOKE_BASE_URL: server.url, SMOKE_ENVIRONMENT: 'ci', SMOKE_IMAGE: IMAGE });
    assert.equal(ci.code, 0, ci.output);
  });

  test('a malformed switch file fails every environment', async (t) => {
    const suite = suiteWithSwitches('{ "failProductionSmoke": "no" }\n');
    t.after(suite.remove);
    const ci = await runSmoke(suite.script, { SMOKE_BASE_URL: server.url, SMOKE_ENVIRONMENT: 'ci', SMOKE_IMAGE: IMAGE });
    assert.equal(ci.code, 1, ci.output);
    assert.match(ci.output, /switches\.json must be exactly \{ "failProductionSmoke": true \| false \}/);
  });

  test('refuses to run without a base URL or a known environment', async () => {
    const noUrl = await runSmoke(SMOKE, { SMOKE_BASE_URL: '', SMOKE_ENVIRONMENT: 'production', SMOKE_IMAGE: IMAGE });
    assert.equal(noUrl.code, 2, noUrl.output);
    assert.match(noUrl.output, /SMOKE_BASE_URL must be an http or https URL/);
    const noEnvironment = await runSmoke(SMOKE, { SMOKE_BASE_URL: server.url, SMOKE_IMAGE: IMAGE });
    assert.equal(noEnvironment.code, 2, noEnvironment.output);
    assert.match(noEnvironment.output, /SMOKE_ENVIRONMENT must be one of ci, production/);
  });
});

for (const [missing, env, reason] of [
  ['setting', { CANARY_SECRET: 'not-shown' }, /FAIL setting delivered: CANARY_GREETING is missing/],
  ['secret', { CANARY_GREETING: 'Hello from canary' }, /FAIL secret delivered: CANARY_SECRET is missing/],
]) {
  test(`fails when the ${missing} is missing`, async (t) => {
    const server = await startServer(env);
    t.after(() => server.stop());
    const result = await runSmoke(SMOKE, { SMOKE_BASE_URL: server.url, SMOKE_ENVIRONMENT: 'ci', SMOKE_IMAGE: IMAGE });
    assert.equal(result.code, 1, result.output);
    assert.match(result.output, reason);
  });
}

test('fails when the canary never answers', async () => {
  const result = await runSmoke(SMOKE, {
    SMOKE_BASE_URL: 'http://127.0.0.1:9',
    SMOKE_ENVIRONMENT: 'ci',
    SMOKE_IMAGE: IMAGE,
    SMOKE_READY_TIMEOUT_MS: '500',
  });
  assert.equal(result.code, 1, result.output);
  assert.match(result.output, /FAIL reachable: no answer from http:\/\/127\.0\.0\.1:9\/healthz/);
});

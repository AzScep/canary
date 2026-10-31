import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { root } from './helpers.mjs';

const read = (file) => readFileSync(path.join(root, file), 'utf8');
const NODE_IMAGE = /node:22-alpine@sha256:[0-9a-f]{64}/;

test('the base image and the smoke runner are the same digest-pinned Node image', () => {
  const base = read('Dockerfile').match(/^FROM (\S+)$/m)?.[1];
  const runner = read('scripts/smoke-container.sh').match(/^readonly SMOKE_RUNNER_IMAGE='(\S+)'$/m)?.[1];
  assert.match(base ?? '', NODE_IMAGE);
  assert.equal(runner, base);
});

test('every workflow action is pinned to a full commit SHA', () => {
  const directory = path.join(root, '.github/workflows');
  for (const file of readdirSync(directory)) {
    for (const [, action] of read(`.github/workflows/${file}`).matchAll(/uses:\s*(\S+)/g)) {
      assert.match(action, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/, `${file}: ${action}`);
    }
  }
});

test('the evidence names the suite the platform runs', () => {
  assert.match(read('scripts/release-evidence.mjs'), /const SMOKE_SUITE = 'smoke\/smoke\.mjs';/);
  assert.match(read('scripts/smoke-container.sh'), /node \/suite\/smoke\/smoke\.mjs/);
});

// The platform's secrets-set readiness check reads .env.example's names; without them it would see
// no secret to require and pass without checking CANARY_SECRET.
test('.env.example names exactly the setting and the secret the server reads', () => {
  const server = read('src/server.mjs');
  const names = [...server.matchAll(/^const (?:SETTING|SECRET) = '([A-Z_]+)';$/gm)].map(([, name]) => name).sort();
  const example = read('.env.example').split('\n').filter((line) => /^[A-Z_]+=/.test(line)).map((line) => line.split('=')[0]).sort();
  assert.deepEqual(names, ['CANARY_GREETING', 'CANARY_SECRET']);
  assert.deepEqual(example, names);
});

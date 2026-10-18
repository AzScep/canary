import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { root } from './helpers.mjs';

const DIGEST = `sha256:${'b'.repeat(64)}`;
const valid = {
  GITHUB_REPOSITORY: 'AzScep/canary',
  GITHUB_SHA: 'c'.repeat(40),
  GITHUB_RUN_ID: '12345678901',
  IMAGE: `ghcr.io/azscep/canary@${DIGEST}`,
  SMOKE_IMAGE: `ghcr.io/azscep/canary@${DIGEST}`,
  SMOKE_OUTCOME: 'passed',
  SMOKE_STARTED_AT: '2026-10-18T09:00:00Z',
  SMOKE_COMPLETED_AT: '2026-10-18T09:00:07Z',
};

function build(env) {
  const directory = mkdtempSync(path.join(tmpdir(), 'canary-evidence-'));
  const output = path.join(directory, 'release-evidence.json');
  const result = spawnSync(process.execPath, ['scripts/release-evidence.mjs', output], {
    cwd: root,
    env: { PATH: process.env.PATH, ...env },
    encoding: 'utf8',
  });
  let written = null;
  try { written = readFileSync(output, 'utf8'); } catch { /* not written */ }
  rmSync(directory, { recursive: true, force: true });
  return { code: result.status, stderr: result.stderr, written };
}

test('writes app-release-evidence.v1 for the pushed digest and its passed smoke run', () => {
  const result = build(valid);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.written, `${JSON.stringify({
    schemaVersion: 'app-release-evidence.v1',
    app: 'canary',
    sourceRepository: 'AzScep/canary',
    sourceSha: 'c'.repeat(40),
    buildRunId: '12345678901',
    image: `ghcr.io/azscep/canary@${DIGEST}`,
    smoke: {
      suite: 'smoke/smoke.mjs',
      image: `ghcr.io/azscep/canary@${DIGEST}`,
      outcome: 'passed',
      startedAt: '2026-10-18T09:00:00Z',
      completedAt: '2026-10-18T09:00:07Z',
    },
  }, null, 2)}\n`);
});

for (const [name, change, reason] of [
  ['a smoke that did not pass', { SMOKE_OUTCOME: 'failed' }, /smoke outcome must be passed/],
  ['smoke on another digest', { SMOKE_IMAGE: `ghcr.io/azscep/canary@sha256:${'d'.repeat(64)}` }, /smoke ran on another image/],
  ['an image outside the canary repository', { IMAGE: `ghcr.io/azscep/other@${DIGEST}`, SMOKE_IMAGE: `ghcr.io/azscep/other@${DIGEST}` }, /IMAGE must be ghcr\.io\/azscep\/canary@sha256:<digest>/],
  ['a tag instead of a digest', { IMAGE: 'ghcr.io/azscep/canary:latest', SMOKE_IMAGE: 'ghcr.io/azscep/canary:latest' }, /IMAGE must be ghcr\.io\/azscep\/canary@sha256:<digest>/],
  ['fractional seconds', { SMOKE_STARTED_AT: '2026-10-18T09:00:00.123Z' }, /SMOKE_STARTED_AT must be a UTC time in whole seconds/],
  ['an impossible date', { SMOKE_COMPLETED_AT: '2026-02-30T09:00:00Z' }, /SMOKE_COMPLETED_AT must be a UTC time in whole seconds/],
  ['times out of order', { SMOKE_COMPLETED_AT: '2026-10-18T08:59:59Z' }, /smoke completed before it started/],
  ['a short commit', { GITHUB_SHA: 'abc123' }, /GITHUB_SHA must be a full commit SHA/],
  ['a missing run id', { GITHUB_RUN_ID: '' }, /GITHUB_RUN_ID must be a run id/],
  ['a run from another repository', { GITHUB_REPOSITORY: 'someone/canary' }, /GITHUB_REPOSITORY must be AzScep\/canary/],
]) {
  test(`refuses ${name} and writes nothing`, () => {
    const result = build({ ...valid, ...change });
    assert.equal(result.code, 1);
    assert.match(result.stderr, reason);
    assert.equal(result.written, null);
  });
}

// Writes release-evidence.json (app-release-evidence.v1) for the platform's intake, which
// checks it against the canary's contract in AzScep/deployment-script:
//   node scripts/release-evidence.mjs <output path>
// Inputs come from the release workflow's environment. The workflow runs this only after the smoke
// gate exited 0 against the pushed digest, so that step's success is the smoke evidence; this
// script checks the inputs' shapes and writes nothing when one is wrong.
import { writeFileSync } from 'node:fs';

const APP = 'canary';
const SOURCE_REPOSITORY = 'AzScep/canary';
const IMAGE_REPOSITORY = 'ghcr.io/azscep/canary';
const SMOKE_SUITE = 'smoke/smoke.mjs';

function refuse(message) {
  console.error(`release evidence refused: ${message}`);
  process.exit(1);
}

function input(name, pattern, description) {
  const value = process.env[name] ?? '';
  if (!pattern.test(value)) refuse(`${name} must be ${description}`);
  return value;
}

function timestamp(name) {
  const value = input(name, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, 'a UTC time in whole seconds, such as 2026-10-18T09:00:00Z');
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().replace('.000Z', 'Z') !== value) {
    refuse(`${name} must be a UTC time in whole seconds, such as 2026-10-18T09:00:00Z`);
  }
  return value;
}

const output = process.argv[2];
if (!output) refuse('pass the output path');

const imagePattern = new RegExp(`^${IMAGE_REPOSITORY.replace(/[./]/g, '\\$&')}@sha256:[0-9a-f]{64}$`);
const sourceRepository = input('GITHUB_REPOSITORY', new RegExp(`^${SOURCE_REPOSITORY}$`), SOURCE_REPOSITORY);
const sourceSha = input('GITHUB_SHA', /^[0-9a-f]{40}$/, 'a full commit SHA');
const buildRunId = input('GITHUB_RUN_ID', /^[1-9][0-9]*$/, 'a run id');
const image = input('IMAGE', imagePattern, `${IMAGE_REPOSITORY}@sha256:<digest>`);
const startedAt = timestamp('SMOKE_STARTED_AT');
const completedAt = timestamp('SMOKE_COMPLETED_AT');
if (new Date(completedAt) < new Date(startedAt)) refuse('smoke completed before it started');

const evidence = {
  schemaVersion: 'app-release-evidence.v1',
  app: APP,
  sourceRepository,
  sourceSha,
  buildRunId,
  image,
  smoke: { suite: SMOKE_SUITE, image, outcome: 'passed', startedAt, completedAt },
};
writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
console.log(`wrote ${output} for ${image}`);

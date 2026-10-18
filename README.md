# Canary

The platform's permanent test app.
It is one web container with one setting and one secret, deployed through the light release path of [AzScep/deployment-script](https://github.com/AzScep/deployment-script) so that any platform change can redeploy it to prove the path still works.

## What it does

- `/` shows the setting `CANARY_GREETING` and whether the secret `CANARY_SECRET` is present.
- `/status.json` reports the same as JSON; the secret appears only as `present: true` or `false`, never by value.
- `/healthz` answers `ok` while the process serves, with or without config.

The canary starts without config on purpose, so a missing setting or secret fails the smoke gate's checks instead of looking like an outage.

## Smoke gate

`smoke/smoke.mjs` is the smoke gate, compiled from the feature map in [.claude/skills/verify/features/](.claude/skills/verify/features/README.md).
It follows the platform's suite contract: a Node 22 script with only built-in modules, run as `node smoke/smoke.mjs` with `SMOKE_BASE_URL`, `SMOKE_ENVIRONMENT` (`ci` or `production`), and `SMOKE_IMAGE`, exiting 0 only when every check passed.
It fails when the setting or the secret is missing, so config delivery is exercised on every deploy.

### Failing production smoke on purpose

`smoke/switches.json` holds one switch, `failProductionSmoke`.
With it set to `true`, the gate still passes in CI but fails in production, so the release is accepted, deployed, and then rolled back automatically.
To exercise automatic rollback:

1. Merge a change that sets `"failProductionSmoke": true`.
2. Watch the platform deploy it, fail its production smoke, mark it bad, and roll back to the newest good release.
3. Merge a change that sets it back to `false`; that release deploys normally.

The production smoke runs the suite from each release's own commit, so the rollback target's smoke is unaffected by the switch.

## Release path

- `.github/workflows/ci.yml` runs on every pull request: `npm test`, then the built image smoked with its config and again without it, where the gate must reach the canary and fail both config checks.
  `scripts/smoke-container.sh` mirrors the platform's production smoke invocation (read-only, non-root, only the smoke variables); its pinned runner is this repository's own Node base image until the platform publishes its runner digest.
- `.github/workflows/release.yml` runs on every push to `main`: it pushes `ghcr.io/azscep/canary`, reruns the smoke gate against the exact pushed digest, and uploads the `release-evidence` artifact holding only `release-evidence.json` (`app-release-evidence.v1`).
- `.github/workflows/notify-intake.yml` runs when that release run has completed successfully and sends `repository_dispatch` type `app-release.v1` with `{"app": "canary", "runId": "<run id>"}` to `AzScep/deployment-script`, whose intake reads the run and its evidence back from this repository.

The platform's side, including how the canary is deployed and configured, lives in `canary/` in `AzScep/deployment-script`.

## One-time setup

- Install the platform's Release App on this repository, so intake can read runs and artifacts (actions and contents, read only).
- Create the Actions environment `intake-dispatch` with a deployment branch rule allowing only `main`, and add `INTAKE_DISPATCH_TOKEN` to it as an environment secret.
  Branch rules on environments need this repository to be public (or a paid plan); the canary holds nothing private, so public is the intended setting.
- `INTAKE_DISPATCH_TOKEN` is a fine-grained personal access token whose only repository is `AzScep/deployment-script`, with Contents read and write, which GitHub requires for a repository dispatch.
  It is deliberately not the Release App, so it cannot write records the apply workflow trusts.
  It can still push to `AzScep/deployment-script`, including `main`, which that repository cannot protect on its current plan, and workflows on `main` hold the Komodo deploy key; treat it as a production credential, give it a short expiry, and revoke it if this repository's secrets may have leaked.
- After the first release, make the `canary` package on ghcr.io pullable by the server: public, or readable with the server's registry credential.

## Development

- `npm test` runs the server, smoke suite, evidence, and pin tests.
- `CANARY_GREETING='Hello' CANARY_SECRET=anything npm start` serves on port 8080.
- `docker build -t canary:local . && scripts/smoke-container.sh canary:local` smokes the image the way the platform does.

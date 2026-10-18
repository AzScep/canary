---
name: verify
description: Drive the canary the way a user and the platform do, to prove a change works. Use for /verify, before merging a change to the canary, or when the smoke gate fails and the cause is unclear.
---

# Verify the canary

The canary is one web container that shows its setting `CANARY_GREETING` and whether its secret `CANARY_SECRET` was delivered.
Its feature map is in [features/](features/README.md); the smoke gate `smoke/smoke.mjs` is compiled from it.

## Launch

- From source: `CANARY_GREETING='Hello' CANARY_SECRET=anything PORT=8080 npm start`, then open `http://127.0.0.1:8080`.
- As the image: `docker build -t canary:local .`, then `scripts/smoke-container.sh canary:local`.
- Against a deployed canary: `SMOKE_BASE_URL=https://<host> SMOKE_ENVIRONMENT=production SMOKE_IMAGE=<image> node smoke/smoke.mjs`.

## Helpers

- `smoke/smoke.mjs` - the deterministic smoke gate; the only thing the platform runs against production.
- `scripts/smoke-container.sh <image> [--without-config]` - runs the gate against an image in the platform's pinned runner; with `--without-config` it passes only when the gate fails.
- `npm test` - server, smoke suite, evidence, and pin tests.

## Rules

- Never print, log, or paste the secret's value; the canary reports it only as present or missing.
- When a feature changes, update its file in `features/` and the matching check in `smoke/smoke.mjs` in the same change.

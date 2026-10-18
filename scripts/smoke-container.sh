#!/usr/bin/env bash
# Runs the smoke gate against a canary image the way the platform's production smoke does: the
# suite runs from this checkout, mounted read-only, in a pinned Node container that sees only the
# three smoke variables.
#   scripts/smoke-container.sh <image> [--without-config]
# --without-config starts the canary with neither its setting nor its secret, and exits 0 only
# when the smoke gate fails, proving the gate catches a missing config.
set -euo pipefail

readonly SMOKE_RUNNER_IMAGE='node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402'

image=${1:?usage: scripts/smoke-container.sh <image> [--without-config]}
mode=${2:-}
if [[ -n "$mode" && "$mode" != --without-config ]]; then
  echo "unknown option: $mode" >&2
  exit 2
fi

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
suffix="$$-$RANDOM"
network="canary-smoke-$suffix"
app="canary-smoke-app-$suffix"

trap 'docker rm --force "$app" >/dev/null 2>&1 || true; docker network rm "$network" >/dev/null 2>&1 || true' EXIT

config=(--env CANARY_GREETING='Hello from the canary smoke run' --env CANARY_SECRET='ci-only-not-a-real-secret')
if [[ "$mode" == --without-config ]]; then
  config=()
fi

docker network create --internal "$network" >/dev/null
docker run --detach --name "$app" --network "$network" --network-alias canary \
  --read-only --cap-drop ALL --security-opt no-new-privileges \
  ${config[@]+"${config[@]}"} "$image" >/dev/null

set +e
docker run --rm --network "$network" \
  --read-only --tmpfs /tmp --user 1000:1000 --cap-drop ALL --security-opt no-new-privileges \
  --volume "$root:/suite:ro" --workdir /suite \
  --env SMOKE_BASE_URL=http://canary:8080 --env SMOKE_ENVIRONMENT=ci --env SMOKE_IMAGE="$image" \
  "$SMOKE_RUNNER_IMAGE" node /suite/smoke/smoke.mjs
status=$?
set -e

if [[ "$mode" == --without-config ]]; then
  if [[ $status -eq 1 ]]; then
    echo 'the smoke gate failed without config, as it must'
    exit 0
  fi
  echo "the smoke gate exited $status without config; it must fail with 1" >&2
  docker logs "$app" >&2 || true
  exit 1
fi
if [[ $status -ne 0 ]]; then
  docker logs "$app" >&2 || true
fi
exit "$status"

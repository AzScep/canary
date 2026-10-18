# Config delivery

## Sub-features

- The setting `CANARY_GREETING` reaches the container and is shown with its value.
- The secret `CANARY_SECRET` reaches the container and is reported only as present or missing, never by value.
- `/healthz` answers `ok` whenever the process is serving, with or without config, so a missing config shows as a failed check rather than an unreachable app.

## How to get to it (user POV)

Open `/status.json` on the canary's URL.
A delivered config reads `"setting": {"name": "CANARY_GREETING", "present": true, "value": "..."}` and `"secret": {"name": "CANARY_SECRET", "present": true}`.

## Driving it with curl

- `curl -fsS "$URL/healthz"` prints `ok`.
- `curl -fsS "$URL/status.json"` prints the config report above.

## Gotchas

- A value of only whitespace counts as missing for both the setting and the secret.
- The secret object has exactly `name` and `present`; the smoke gate fails if it ever gains a third key, which would be the first step towards leaking the value.

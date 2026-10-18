# Status page

## Sub-features

- `/` shows the setting's value, HTML-escaped, and the secret as `present`; anything missing reads `missing` in a warning colour.
- The page loads no scripts or external resources; its content security policy allows only inline styles.

## How to get to it (user POV)

Open the canary's URL in a browser.
The page lists `CANARY_GREETING` with its value and `CANARY_SECRET` as `present`.

## Driving it with curl

- `curl -fsS "$URL/"` contains `<dd id="setting">` (no `class="missing"`) and `<dd id="secret">present</dd>`.

## Gotchas

- The `id="setting"` and `id="secret"` handles are what the smoke gate reads; keep them when restyling the page.

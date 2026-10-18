# Canary feature map

Each feature has one file with four sections: Sub-features, How to get to it (user POV), Driving it with curl, and Gotchas.
Every check in `smoke/smoke.mjs` names the feature file it comes from.

| Feature | File | Smoke checks |
| --- | --- | --- |
| Config delivery | [config-delivery.md](config-delivery.md) | reachable, setting delivered, secret delivered |
| Status page | [status-page.md](status-page.md) | status page |

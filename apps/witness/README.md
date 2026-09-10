# The Witness

The same URL, seen from three countries at once.

The Witness visits a page from the United States, Germany, and Singapore —
each through a Solari stealth browser with a residential proxy — extracts the
comparable surface of what each location saw, and diffs the results live.

**Thesis:** the web is not one web. A witness agent that can appear from
anywhere inspects the public web more fairly. Recipe:
[`content/recipes/stealth-scraper.md`](../../content/recipes/stealth-scraper.md).

## What it demonstrates

- **Stealth + residential proxy** — `stealth: true` and `proxy: "<country>"`,
  with the egress IP confirmed on every run as the alibi.
- **Concurrent egress** — the three locations run in parallel on purpose: a
  geo-diff must sample the world at roughly the same moment.
- **The teardown moment** — every browser session is closed and released
  after its single observation. Nothing persists. You were never there.

## Quick start

From the repository root (this is a pnpm workspace):

```bash
pnpm install
cp apps/witness/.env.example apps/witness/.env
export SOLARI_API_KEY=slr_live_...   # console.getsolari.com

# Web UI (http://localhost:4568)
pnpm dev:witness

# CLI
pnpm --filter witness cli https://example.com/pricing

# Tests
pnpm --filter witness test
```

## Project structure

```
src/
  pages/
    index.astro        Main page
    api/observe.ts     SSE endpoint streaming the geo-diff
  layouts/
    Layout.astro       HTML shell, fonts, global tokens
  components/
    WitnessApp.tsx     React island (form, location cards, verdict)
  lib/                 Server-side logic (pure, unit-tested)
    orchestrator.ts    Runs all locations concurrently, emits events
    observer.ts        One stealth browser per egress location
    extract.ts         Comparable page-surface extraction
    diff.ts            Geo-diff engine (deterministic)
    locations.ts       Egress location catalog
    url-guard.ts       SSRF guard for visitor-supplied URLs
    types.ts           Shared types
    events.ts          SSE event types
  server/
    cli.ts             CLI entry point
tests/                 Vitest unit tests
```

## Solari gotchas carried over from Blindspot

- **`solari.close()` is mandatory** — skip it and the Node process hangs
  forever (the client keeps a loopback proxy open).
- **`proxy` requires `stealth: true`** — a proxied request from an obviously
  automated browser is the pairing that gets blocked.
- **`commands.run` is not shell-interpreted** (n/a here, but the SDK rule
  holds across primitives).

MIT licensed.

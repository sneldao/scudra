# The Builder

Prompt. Boot. Build. Vanish.

The Builder plans a small app from a prompt, writes it as a self-contained
HTML file, boots it inside a fresh Solari sandbox, and exposes a live preview
URL the visitor can click. One minute later, the sandbox is destroyed — and
the URL becomes a tombstone.

**Thesis:** an agent that can build software should also be able to disappear
with it. Recipe:
[`content/recipes/the-builder.md`](../../content/recipes/the-builder.md).

## What it demonstrates

- **Port preview** — `sandbox.previewUrl(3000)` puts a server running inside
  the VM on the public internet at `*.preview.getsolari.com`.
- **Software born on stage** — plan → write → boot → preview, streamed live
  over SSE.
- **The teardown moment** — the finale is the destruction: the visitor is
  invited to revisit the URL *after* the kill and watch it fail.

## The blueprint engine

`src/lib/blueprint.ts` maps the prompt onto one of four app archetypes
(landing, todo, clock, guestbook) and `render.ts` emits the HTML. It is
deterministic and unit-tested — and it is the seam where an LLM planner can
be slotted in later without touching the orchestrator.

## Quick start

From the repository root (this is a pnpm workspace):

```bash
pnpm install
cp apps/builder/.env.example apps/builder/.env
export SOLARI_API_KEY=slr_live_...   # console.getsolari.com

# Web UI (http://localhost:4569)
pnpm dev:builder

# CLI
pnpm --filter builder cli "a guestbook that gets burned"

# Tests
pnpm --filter builder test
```

## Project structure

```
src/
  pages/
    index.astro        Main page
    api/build.ts       SSE endpoint streaming the build
  layouts/
    Layout.astro       HTML shell, fonts, global tokens
  components/
    BuilderApp.tsx     React island (prompt, beats, preview, tombstone)
  lib/                 Server-side logic (pure where possible)
    orchestrator.ts    Plan → write → boot → preview → teardown
    blueprint.ts       Prompt → app spec (the LLM seam)
    render.ts          App spec → self-contained HTML
    sandbox.ts         Solari sandbox: create, write, serve, preview, kill
    types.ts           Shared types
    events.ts          SSE event types
  server/
    cli.ts             CLI entry point
tests/                 Vitest unit tests
```

## Solari gotchas carried from the cookbook

- **`commands.run` is not shell-interpreted** — backgrounding the server
  requires `run("sh", { args: ["-c", "..."] })`.
- **Background the server** — `run()` waits for process exit; a foreground
  server blocks until the idle timeout.
- **`timeoutMs` is a rolling idle window**, not a hard deadline.
- **`kill()`, not `close()`** — only `kill()` destroys the VM. On any boot
  failure the sandbox is killed before the error propagates.

MIT licensed.

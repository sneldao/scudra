# The Scudra Roadmap

Scudra is a naming franchise for cloud-agent patterns. Solari builds the
primitives; Scudra names the patterns, ships the experiences, and argues the
thesis. This document is the operating plan.

## The thesis we own

**An agent that persists is an agent that can be profiled. Ephemerality is a
design principle, not a security feature.**

Every experience puts ephemerality on stage. The teardown moment — sandbox
killed, browser closed, dossier closing — is a deliberate, dramatic beat in
each demo. The signature line: _you were never there._

## The formula

Each character ships four artifacts, in this order:

1. **Experience** — a live, interactive, editorial-grade demo. Scope rule: a
   compelling 90-second interaction beats a 5-minute dossier. Quality bar:
   Blindspot's DESIGN.md.
2. **Recipe** — runnable code, `pnpm dev`-able, with a `.env.example`. Every
   claim in the essay must be reproducible.
3. **Essay** — one strong thesis per character (`content/`).
4. **Distribution** — each experience is screenshot/GIF-able; the demo is the
   content of the launch thread.

Coverage rule: one character per primitive combination. By the end of the
roadmap we must have at least one pure-Browser, pure-Sandbox, pure-Desktop,
and one all-three experience so the lab covers the full taxonomy.

## The cast

| Character                         | Primitive(s)      | Solari foundation                                   | Status                        |
| --------------------------------- | ----------------- | --------------------------------------------------- | ----------------------------- |
| Blindspot — The Investigator      | Sandbox + Browser | `sandbox-quickstart-ts`, `browser-stealth-proxy-ts` | Live                          |
| Stealth Scraper — The Witness     | Browser           | `browser-stealth-proxy-ts`                          | **In build** (`apps/witness`) |
| Code Interpreter — The Analyst    | Sandbox           | Vultr Docker (provider seam; Solari optional)       | **In build** (`apps/analyst`) |
| Desktop Operator — The Controller | Desktop           | `desktop-computer-use-py`                           | Planned                       |
| Browser Profiles — The Chameleon  | Browser           | `browser-profiles-ts`                               | Planned                       |
| Session Recording — The Archivist | Browser           | `browser-session-recording-py`                      | Planned                       |
| Sandbox Preview — The Builder     | Sandbox           | `sandbox-port-preview-ts`, `sandbox-quickstart-ts`  | **In build** (`apps/builder`) |

## Progress log

- **Blindspot** — live. 3D dossier experience, CLI, 36 unit tests.
- **The Witness** (2026-09) — app scaffolded at `apps/witness` on the
  Blindspot house pattern: Astro SSR + one React island + SSE endpoint +
  pure `lib/` modules + CLI + 15 unit tests (geo-diff engine, SSRF guard).
  Geo-diff works end to end with a `SOLARI_API_KEY`. UI polished for
  launch (2026-09): example-URL chips, running ticker, per-card staged
  beats (launching → reading → seen/unseen stamps), verdict summary with
  diff badges, teardown line. Remaining before flip to live: fresh
  `SOLARI_API_KEY`, a live smoke run, and wiring into the site.
- **The Builder** (2026-09) — app scaffolded at `apps/builder` on the house
  pattern: blueprint engine (deterministic prompt → app spec, the LLM seam),
  pure HTML renderer, sandbox boot with public preview URL + reachability
  check, guaranteed teardown on every path, SSE beats, tombstone finale,
  CLI, 11 unit tests. Repo-wide suite now 62 tests. Note: the Blindspot
  `SOLARI_API_KEY` returns 401 — a fresh key is needed for live runs.
- **Live smoke runs** (2026-11) — fresh `SOLARI_API_KEY` works for
  auth and sandbox sessions, but the account is on the **free plan**:
  stealth mode returns 402 `FeatureRequiresPlan`. **The Builder verified
  end to end** (plan → write → boot → public preview URL → verified
  teardown → tombstone) and flipped to live on the site. **The Witness**
  is code-complete but blocked on a paid Solari plan for stealth+proxy.
  Blindspot's stealth browser will hit the same gate. Site now has
  experience pages for Builder, Witness, and Analyst.
- **The Analyst** (2026-11) — `apps/analyst` for the Vultr Agent Rush hackathon (Challenge 1). Provider-agnostic sandbox interface; hardened Docker provider (no network/secrets, capped, orphan reaper, verified teardown); Vultr Serverless Inference agent loop with bounded self-repair; pandas/matplotlib sandbox image; validated artifacts (charts); HMAC-signed run receipts with a forge-it demo; 7-probe containment board; admission control; health/doctor tooling; mock mode so the product is developed with no Docker. Editorial UI with a sticky live machine panel. 80 unit tests (including a fake `docker` binary covering timeouts, OOM vs timeout, destroy verification, output caps) + WCAG AA axe checks + browser-verified flows. Remaining: live run on the Vultr VM (`--doctor`, `--probe`), deploy, demo video.
- **Sequencing update** — The Builder was built before The Chameleon and
  The Archivist (it shares the most infrastructure with Blindspot/Witness).

## Sequencing

1. **The Witness** (next) — highest wow-to-effort ratio. Geo-diff is simple,
   visually striking, and makes an argument in one screen.
2. **The Builder** — the agent builds software in front of you, in a VM that
   vanishes. Live sandbox preview URL for the visitor.
3. **The Chameleon** — the fingerprint audit; the interactive proof of the
   ephemerality thesis.
4. **The Archivist** — the flight recorder for agents.
5. **The Analyst** and **The Controller** to complete the taxonomy.

## Standing assets

- **The primitive explainer** — an interactive page where visitors launch a
  real sandbox from the page and watch it boot and die. This becomes the
  canonical link everyone shares when explaining cloud agents.
- **Manifesto revisions** — revisit `content/manifesto.md` as characters
  ship. The lab's evolving argument is the thought leadership.
- **Attribution** — every recipe links back to its Solari foundation.
  Solari builds primitives; Scudra defines the vocabulary and the taste.

## Engineering notes

- Each experience app mirrors `apps/blindspot/`: Astro + one React island +
  SSE API route + vanilla TS engine modules.
- Recurring bits (SSE investigation-stream pattern, texture pipeline, scroll
  camera) graduate into `packages/shared` as character #3 onward lands, so
  each successive character gets cheaper to build.
- Recipe pages carry a status; ship source-first, flip to live when the
  experience lands.

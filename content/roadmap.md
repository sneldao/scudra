# The Scudra Roadmap

Scudra is a naming franchise for cloud-agent patterns. Solari builds the primitives; Scudra names the patterns, ships the experiences, and argues the thesis. This document is the operating plan.

**This plan changed after the Agent Rush post-mortem.** The thesis below still holds, but the shape of the work did not: Blindspot is now the PRODUCT — with users, a store, and a signed receipt — and the rest are lab artifacts. See [`long-term-strategy.md`](long-term-strategy.md).

## The thesis we own

**An agent that persists is an agent that can be profiled. Ephemerality is a design principle, not a security feature.**

Every experience puts ephemerality on stage. The teardown moment — sandbox killed, browser closed, dossier closing — is a deliberate, dramatic beat in each demo. The signature line: _you were never there._

The one refinement the product work forced on us: we are not against persistence, we are against the **operator's** persistence. The subject leaves no trace. The user's evidence survives. Getting that backwards in either direction breaks the product.

## The formula

Each character ships four artifacts, in this order:

1. **Experience** — a live, interactive, editorial-grade demo. Scope rule: a compelling 90-second interaction beats a 5-minute dossier. Quality bar: Blindspot's DESIGN.md.
2. **Recipe** — runnable code, `pnpm dev`-able, with a `.env.example`. Every claim in the essay must be reproducible.
3. **Essay** — one strong thesis per character (`content/`).
4. **Distribution** — each experience is screenshot/GIF-able; the demo is the content of the launch thread.

Coverage rule: one character per primitive combination. By the end of the roadmap we must have at least one pure-Browser, pure-Sandbox, pure-Desktop, and one all-three experience so the lab covers the full taxonomy.

## The cast

| Character                         | Primitive(s)      | Solari foundation                                   | Status                         |
| --------------------------------- | ----------------- | --------------------------------------------------- | ------------------------------ |
| Blindspot — The Investigator      | Sandbox + Browser | `sandbox-quickstart-ts`, `browser-stealth-proxy-ts` | **The product** — live, signed |
| Stealth Scraper — The Witness     | Browser           | `browser-stealth-proxy-ts`                          | Lab artifact — `apps/witness`  |
| Code Interpreter — The Analyst    | Sandbox           | Vultr Docker (provider seam; Solari optional)       | Live — `apps/analyst`          |
| Desktop Operator — The Controller | Desktop           | `desktop-computer-use-py`                           | Planned                        |
| Browser Profiles — The Chameleon  | Browser           | `browser-profiles-ts`                               | Planned                        |
| Session Recording — The Archivist | Browser           | `browser-session-recording-py`                      | Planned                        |
| Sandbox Preview — The Builder     | Sandbox           | `sandbox-port-preview-ts`, `sandbox-quickstart-ts`  | Lab artifact — `apps/builder`  |

## Progress log

- **The Agent Rush post-mortem** (2026-11) — we lost to packaging, not to technology: we submitted a taxonomy when the judges wanted a product, our use case was the brief's own example, and our repo was a visible fork of the seeded cookbook. Full write-up in [`postmortem-agent-rush.md`](postmortem-agent-rush.md).
- **The product pivot** (2026-11) — Blindspot becomes the product; the lab becomes the funnel. Strategy and the rules we now build by: [`long-term-strategy.md`](long-term-strategy.md).
- **`@scudra/evidence`** (2026-11) — the verifiable-output primitives, shared by both apps: canonical encoding, content hashing, Ed25519 signing, answer grounding, and a generic signed receipt. A receipt from the Analyst and a receipt from Blindspot are verified by the same code.
- **Blindspot as a product** (2026-11) — the case store (SQLite, via `node:sqlite`), the durable/ephemeral split (the subject's raw material expires on a TTL; the user's evidence does not), the signed receipt per case, the public verification endpoint, the export, the feedback loop, the cost estimate, first-party analytics, and a waitlist. The 3D dossier moved to `/dossier`; the product surface is at `/`.
- **The Analyst's receipts upgraded** (2026-11) — from a shared-secret HMAC to Ed25519, so a third party can verify a receipt with the published public key and no secret. The public key is served at `GET /api/verify`.
- **A grounding bug found and fixed** (2026-11) — the prose number scanner matched across a factor of 100 for every number, so `9,999,999` looked grounded by a `1,000,000,000` liquidity value. Scaling now applies only to numbers that actually look like percentages or fractions, and Blindspot's structured verdicts ground by **metric name** against an independent recomputation instead of by prose scan.
- **Live smoke runs** (2026-11) — fresh `SOLARI_API_KEY` works for auth and sandbox sessions, but the account is on the **free plan**: stealth mode returns 402 `FeatureRequiresPlan`. **The Builder verified end to end** (plan → write → boot → public preview URL → verified teardown → tombstone) and flipped to live on the site. **The Witness** is code-complete but blocked on a paid Solari plan for stealth+proxy. Blindspot's stealth browser will hit the same gate. Site now has experience pages for Builder, Witness, and Analyst.
- **The Analyst** (2026-11) — `apps/analyst` for the Vultr Agent Rush hackathon (Challenge 1). Provider-agnostic sandbox interface; hardened Docker provider (no network/secrets, capped, orphan reaper, verified teardown); Vultr Serverless Inference agent loop with bounded self-repair; pandas/matplotlib sandbox image; validated artifacts (charts); signed run receipts with a forge-it demo; 7-probe containment board; admission control; health/doctor tooling; mock mode so the product is developed with no Docker. Editorial UI with a sticky live machine panel. 88 unit tests (including a fake `docker` binary covering timeouts, OOM vs timeout, destroy verification, output caps) + WCAG AA axe checks + browser-verified flows.
- **The Analyst — deployed** (2026-11) — live at `https://scudra.persidian.com` on a Vultr Cloud Compute VM (vc2-1c-1gb, Los Angeles, ~$0.01/hr). Stack: Ubuntu 24.04, Docker 29, Node 22, pnpm, systemd unit + Caddy TLS. Verified on the VM: `--doctor` all green, `--probe` 7/7 BLOCKED on real Docker, live SSE run end to end. Demo video published on YouTube (https://youtu.be/8iDC_EZxAu4).
- **Sequencing update** — The Builder was built before The Chameleon and The Archivist (it shares the most infrastructure with Blindspot/Witness).

## Sequencing

The plan is no longer a sequence of characters. It is a sequence of **product steps**, in this order:

1. **Find a user.** The waitlist is live; the feedback loop is live. Talk to the people who answer. Everything after this is informed by that.
2. **Own the primitive.** The stealth browser is gated behind a third party's free plan. Move it behind our own provider seam so nobody else's pricing page sets our roadmap.
3. **Make the numbers checkable at scale.** The metric-based grounding works for one case; it needs the expected-verdict harness, a control group, and CI.
4. **Then the rest of the taxonomy.** The Witness, The Builder, The Chameleon, The Archivist, The Controller — as lab artifacts and essays, at the pace they deserve.

## Standing assets

- **The primitive explainer** — an interactive page where visitors launch a real sandbox from the page and watch it boot and die. This becomes the canonical link everyone shares when explaining cloud agents.
- **Manifesto revisions** — revisit `content/manifesto.md` as the product ships. The lab's evolving argument is the thought leadership.
- **Attribution** — every recipe links back to its Solari foundation. Solari builds primitives; Scudra defines the vocabulary and the taste.

## Engineering notes

- Each experience app mirrors `apps/blindspot/`: Astro + one React island + SSE API route + vanilla TS engine modules.
- Recurring bits (SSE investigation-stream pattern, texture pipeline, scroll camera) graduate into `packages/shared` as character #3 onward lands, so each successive character gets cheaper to build.
- **Verifiable-output primitives live in `packages/evidence`**, not in an app, so both experiences share one implementation of canonical encoding, hashing, signing and grounding.
- Recipe pages carry a status; ship source-first, flip to live when the experience lands.

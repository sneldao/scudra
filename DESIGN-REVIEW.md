# Scudra — UX / Design / Language Review

*Working review doc. Scope: intuitive, immersive, memorable; performant and
enjoyable; clearer language. Reviewed across `apps/site`, `apps/blindspot`,
`apps/witness`, `apps/builder`, `packages/shared`, and `content/`.*

---

## 1. Executive summary

Scudra has a genuinely strong foundation: a distinctive editorial voice, a
disciplined warm-paper/ink/terracotta palette, a real commitment to
accessibility and reduced-motion, and one genuinely flagship experience
(Blindspot's 3D dossier) that is ahead of most portfolio work.

The biggest wins are **not** more motion or more styling — they are **clarity
and wayfinding**. The most impressive thing in the lab (the interactive
Blindspot dossier) is effectively hidden from the site, and the naming is
inconsistent enough that a first-time visitor can't tell what anything is.
Language and information architecture will move the needle far more than
another shader.

Priorities, in order:

1. **P0 — Fix the IA so the flagship experiences are reachable.** "Open
   dossier" currently leads to a static description page, not the 3D
   experience.
2. **P0 — Unify naming.** One canonical name per experience everywhere.
3. **P1 — Rewrite jargon-dense copy into plain, vivid language** (with a
   clear glossary for the unavoidable terms).
4. **P1 — Unify the design tokens** (three slightly different palettes drift
   today).
5. **P2 — Motion pass** on Witness/Builder finales and the site reveal system.
6. **P2 — Progressive-enhancement fix** so content never hides if JS fails.

---

## 2. The core problem: the flagship is hidden

The homepage "Featured experience" button reads **"Open the dossier"** and
links to `/experiences#blindspot` — a *card* on the experiences index. From
there, "Open dossier" links to `/experiences/blindspot`, which is a **static
article page** ("Run it locally", "Read the recipe", "What it demonstrates").
The actual interactive 3D dossier lives in the separate `apps/blindspot` app.

So a visitor who clicks the most prominent CTA on the site never reaches the
interactive experience. The single most impressive artifact in the repo is
one hop away from being invisible.

**Recommendation:**

- Deploy the experience apps and link the CTAs directly to the live
  interactive routes.
- On the site, make the "Open dossier" / "Try the experience" buttons point at
  the **interactive** experience, and treat the static article as the
  secondary "About / Read the recipe" path.
- Consider embedding the experience (or a live preview) inline on the
  experience landing page so the wow is visible before any click.

---

## 3. Naming & language clarity (the highest-leverage work)

### 3a. Dual naming is confusing

Every experience has two names — a functional one and a character one — and
they're used inconsistently across surfaces:

| App / recipe slug | Character name | Functional name | Where each appears |
|---|---|---|---|
| `blindspot` | The Investigator | Blindspot | Site uses "Blindspot"; recipe title "Blindspot — The Investigator" |
| `stealth-scraper` / `witness` | The Witness | Stealth Scraper | App header "The Witness"; site card "Stealth Scraper"; recipe "Stealth Scraper — The Witness" |
| `the-builder` / `builder` | The Builder | Sandbox Preview | Recipe "Sandbox Preview — The Builder"; app "The Builder" |

A first-time visitor sees "Blindspot", "Stealth Scraper", and "The Witness"
and can't tell if "Witness" and "Stealth Scraper" are the same thing.

**Recommendation — pick one canonical name and use it everywhere:**

- **Blindspot** (drop "The Investigator" from the UI; keep it as a subtitle
  only if it earns its place).
- **The Witness** (drop "Stealth Scraper" from the UI; the recipe slug can
  stay `stealth-scraper` internally).
- **The Builder** (drop "Sandbox Preview").

Then apply the same label on: site nav, homepage, experiences index, recipe
titles, app headers, and README. Consistency *is* clarity.

### 3b. Jargon density

The homepage subhead and the Blindspot description are dense with terms a
general reader won't know:

> "Scudra is a collection of real-world recipes and experiences for cloud
> agents: ephemeral browsers, sandboxes, and desktops that do work on your
> behalf and leave no trace."

> "Resolve an ENS name, run Mobula inside an ephemeral sandbox, enrich
> off-chain context through a stealth browser, and receive a verdict."

**Recommendation:** lead with the *outcome* in plain language, then layer the
jargon only where it's needed, with a one-line definition on first use.

Suggested homepage subhead (outcome-first):

> "Scudra is a collection of live demos and recipes for **software that runs
> in the cloud, does a job, and leaves no trace behind** — no laptop, no
> history, no fingerprints."

Suggested Blindspot one-liner (outcome-first):

> "Look up an ENS name and watch an agent quietly investigate it — resolving
> the wallet, checking the onchain holdings, and digging up off-chain
> context — then hand you a verdict. It does all of it from a disposable
> cloud machine that vanishes when you're done."

### 3c. "You were never here" vs "you were never there"

The signature line is inconsistent:

- Blindspot dossier cover: **"you were never here"**
- Blindspot teardown / Witness teardown / Builder tombstone: **"you were never
  there"**
- Roadmap defines the signature as **"you were never there."**

**Recommendation:** unify on **"you were never there"** everywhere. It's the
branded line and the roadmap's canonical phrasing.

### 3d. Verb / CTA consistency

Buttons vary: "Open the dossier" vs "Open dossier", "Read the recipe" vs
"Read recipe", "Try the experience", "Run it locally". Standardize:

- **"Try it"** / **"Open the experience"** for interactive demos.
- **"Read the recipe"** for docs.
- **"View source"** for code.

### 3e. Abstract labels → concrete ones

- "Three primitives" → keep, but subtitle it "the three building blocks" on
  first mention.
- "Privacy-preserving onchain investigation" → "Investigate an ENS name
  without leaving a trace."
- Witness verdict "One web — this time." is great; the summary line
  ("3 of 3 locations saw the page · 2 differences between them") can be
  plainer: "All three locations saw the same page, with 2 differences between
  them."

### 3f. Loading / beat copy

Blindspot's loading beats are good progressive disclosure but jargon-heavy:
"spawning ephemeral sandbox…", "routing through residential proxy…",
"enriching off-chain context…". Prefer human verbs:

- "spawning ephemeral sandbox…" → "booting a disposable machine…"
- "routing through residential proxy…" → "connecting through a residential IP…"
- "enriching off-chain context…" → "gathering off-chain context…"

---

## 4. UX / information architecture

- **No mobile nav.** The `Nav` uses a horizontal `ul` with `gap-6`; on small
  screens it will overflow. Add a collapse/hamburger or wrap, plus an active
  link state.
- **Two reveal systems.** `global.css` defines both `[data-reveal]` (used by
  GSAP) and a `.reveal`/`.reveal.active` pair (dead code). Remove the dead
  one.
- **No empty/error affordance on recipe grids** — minor.
- **Witness/Builder:** the cards all mount at once and fill via beats. For
  drama, reveal cards *sequentially* as each location reports, and give the
  verdict a distinct entrance (see Motion).
- **No "what just happened" recap** after a Witness/Builder run beyond the
  teardown line — a short "what you just saw" line would help first-timers
  understand the point.

---

## 5. Visual design / token unification

Three palettes drift today:

| Token | Site (`tailwind.config` / `shared`) | Blindspot (`DESIGN.md`) | Witness / Builder (`DESIGN.md`) |
|---|---|---|---|
| paper | `#faf8f3` | oklch(0.98 0.005 85) | `#faf8f3` |
| ink | `#1a1a1a` | oklch(0.15 0.01 270) | `#26262e` (blue-ish) |
| accent | `#c45f34` | oklch(0.62 0.14 40) | `#c26b3f` (different) |
| line | — | — | `#e3ddd0` |

The Witness/Builder ink is noticeably bluer and the accent is a different
terracotta than the site. **Recommendation:** make `packages/shared` the
single source of truth for tokens (hex + oklch equivalents), and have every
app import from it. This is cheap now and gets expensive as the cast grows.

Also: Witness/Builder keep their styles as inline `<style>` strings inside the
React component. Extract shared primitives (form, card, stamp, verdict,
tombstone) into `packages/shared` so the "house pattern" is actually shared.

---

## 6. Motion design

The motion philosophy is already good: scroll-driven, proximity-based, only
transform/opacity/shader, reduced-motion respected. Specific gaps:

- **Site reveals are uniform.** Every `[data-reveal]` does the same 24px
  fade-up with `power2.out`. Add stagger to grids, vary ease/duration by
  element weight, and consider a subtle parallax on the hero.
- **`toggleActions: "play none none reverse"`** re-runs reveals on scroll-up,
  which can feel janky. Consider `"play none none none"` (fire once) for
  most elements.
- **Witness/Builder finales are text-only.** The teardown/tombstone is meant
  to be *the* dramatic beat. Give it presence: a card that "burns out" /
  dissolves, a stamp that slams in, a countdown ring on the Builder's live
  preview (60s is already the design; make it visible).
- **Blindspot** is the reference for motion taste — keep it as the bar.

---

## 7. Performance

- Blindspot's texture budget is documented at **~60–70MB worst case** on 2×
  displays. That's heavy for a single page. If the goal is "performant and
  enjoyable," consider capping texture resolution, using a lower mipmap
  tier, or lazy-declassifying only the visible panel. The DESIGN.md already
  notes the fallback (1024 shadow map, disable shadows) — make that the
  default on low-end/mobile.
- Site loads Google Fonts (Fraunces/Inter/JetBrains Mono) from the network
  while the experience apps self-host via `@fontsource`. Unify on
  self-hosted to avoid render-blocking and FOUT, and to match the DESIGN.md
  rule ("load fonts from the network" is a Don't).

---

## 8. Progressive enhancement / resilience

`global.css` sets `[data-reveal] { opacity: 0 }` unconditionally. If the GSAP
bundle fails or is slow, **all revealed content stays invisible** — a blank
page with a working nav. Fix: gate the initial hidden state behind a
`no-js`/`js-enabled` class on `<html>`, or set opacity via JS only.

---

## 9. Prioritized roadmap

**P0 (do first — clarity & reachability)**
- Route CTAs to the live interactive experiences; surface the flagship.
- Unify naming to one canonical name per experience across all surfaces.
- Unify "you were never there" signature line.
- Fix the `[data-reveal]` no-JS visibility risk.

**P1 (high impact)**
- Rewrite jargon-dense homepage/experience copy outcome-first; add a small
  glossary for unavoidable terms.
- Unify design tokens into `packages/shared`; align Witness/Builder palette.
- Add mobile nav + active states.
- Remove dead `.reveal` system.

**P2 (polish)**
- Motion pass: staggered site reveals, Witness/Builder finale drama, visible
  Builder countdown.
- Extract shared UI primitives into `packages/shared`.
- Self-host fonts on the site; cap Blindspot texture budget on low-end.

---

## 10. Implementation status (2026-09)

Implemented on branch `cline/vbmd5xy7`:

**P0 — done**
- CTA routing: added `EXPERIENCE_URLS` in `packages/shared` (env-driven via
  `PUBLIC_BLINDSPOT_URL` / `PUBLIC_WITNESS_URL` / `PUBLIC_BUILDER_URL`, with
  sensible fallbacks). Wired homepage, experiences index, recipe pages, and the
  Blindspot article's primary CTA to route into the live interactive
  experiences when deployed.
- Canonical naming: Blindspot / The Witness / The Builder applied across site
  pages, `recipes.ts`, README, recipe markdown H1s, roadmap, and app READMEs.
- Signature line unified to "you were never there" (Blindspot cover + verdict).
- No-JS reveal fix: `html.no-js` → inline script flips to `js`; reveals only
  hide under `.js [data-reveal]`. Removed dead `.reveal` system.

**P1 — done**
- Outcome-first copy on homepage, experiences index, Blindspot article, and
  Witness/Builder ledes; humanized Blindspot loading beats; plainer Witness
  ticker + verdict summary; consistent CTA verbs.
- Token unification: shared palette now exposes short-name aliases
  (`--paper`, `--ink`, `--accent`, `--line`, …); Witness/Builder `:root`
  aligned to the canonical hex values.
- Mobile nav with hamburger + active-link states (plain CSS, token-driven).
- Removed dead `.reveal` CSS.

**P2 — done (light)**
- ScrollProvider: fire-once reveals + sibling stagger.
- Builder: live preview countdown ("Dies in Ns"), styled build beats + tombstone
  finale entrance. Witness: stamp slam + teardown entrance.

**Deferred items — now done (follow-up pass)**
- Self-host fonts on the site (`@fontsource` added to `apps/site`; Google Fonts
  links removed from `Layout.astro`). Deps added, verified by `pnpm typecheck`.
- Extract shared UI primitives into `packages/shared`: new
  `packages/shared/src/styles/experience.css` with `.sc-*` primitives
  (form, chips, card, stamp, ticker, teardown, tombstone, error + keyframes);
  Witness and Builder now consume them, trimming their inline STYLES to
  app-specific rules only. Both apps depend on `@scudra/shared` (workspace:*).
- Cap Blindspot's texture budget on low-end: new `apps/blindspot/src/client/
  quality.ts` auto-detects low-end devices and caps render pixel ratio, VSM
  shadow map, blur samples, and panel texture scale (DESIGN.md updated). On
  the most constrained devices it also disables shadow casting on sub-planes
  (the chart segments), keeping only the current panel's grounding shadow.
- `PUBLIC_*` experience URLs: mechanism is fully wired (`EXPERIENCE_URLS` in
  `packages/shared`) and documented in `apps/site/.env.example` + README. The
  actual values still need to be set once the apps are deployed (cannot be
  known until then).


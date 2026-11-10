# Recommended next steps — Scudra, after the Agent Rush post-mortem

**Written:** 2026-11-10 · Companion to [`postmortem-agent-rush.md`](postmortem-agent-rush.md)

> **Status (2026-11-10):** much of this is superseded. Move 1 (packaging) and
> Move 2 (gVisor, the harness, asymmetric receipts) were written for a
> competition; the competition is over. What survived the change of direction
> is in Move 3 — and the code for it now exists. See
> [`long-term-strategy.md`](long-term-strategy.md) §7 for what shipped and
> what is still open. The two items that remain genuinely open are **a real
> pilot user** and **owning the stealth-browser primitive**.

---

## The short version

We lost on **proof and packaging**, not on code. That means the next move is
_not_ "build a bigger thing." It is two things, in this order:

1. **Make the work we already did legible and checkable.** ~3 days. This is
   what actually lost the last time.
2. **Then raise the ceiling** with one genuinely new thing: turn our
   verifier + grounding + receipt machinery — which nobody else had and which
   we barely used — into the product.

Do them in that order. Repackaging a generic tool caps out at "nice demo." But
repackaging first is what makes step 2 affordable and _verifiable_, and if we
pivot first without fixing packaging we lose again for exactly the same reason.

**One thing only you can decide:** the vertical in step 3. I've given the
criteria and a recommended wedge, but a real pilot user beats a good idea.

---

## Move 1 — Repackage (3 days, zero new features)

Everything here is work we should have done the first time. **Do not skip it
because step 2 sounds more interesting.**

### 1.1 Cut a submission-shaped repo

The judges open one URL. Today that URL says "Scudra — a lab for cloud-native
agents" and hides the product two directories deep.

- New repo (or a rewritten root README) whose first screen is: _one sentence_,
  _one image_, _the live URL_, _the video_, _the run command_.
- The lab (this repo, `apps/site`, the manifesto, the taxonomy) stays — but it
  is **linked to**, not what a judge opens. Two front doors is one too many;
  pick the one that judges open.
- Strip anything that isn't the submission from the repo root. A second
  half-finished app reads as "several shallow projects."

### 1.2 Write the judge doc set

This is ~2 hours of work for a named judging criterion, and it is the single
highest-leverage block in the whole plan.

| File                        | Contents                                                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `docs/EVIDENCE.md`          | **Each published criterion → the artifact that proves it.** The single most valuable file we can write.                             |
| `docs/JUDGES.md`            | "Review this in five minutes" — the exact click path, no archaeology.                                                               |
| `docs/CLAIMS.md`            | Every claim we make, and where the evidence lives (or where it's honestly absent).                                                  |
| `docs/MODEL_CARD.md`        | Which model does which role, what each may/may not do, limits, evaluation.                                                          |
| `docs/BENCHMARK-RESULTS.md` | The expected-verdict harness output (see Move 2) — expected vs observed per case, containment counters, known gaps.                 |
| `docs/FEEDBACK.md`          | Build-week retrospective: what broke, what we fixed, what worked. Airlock and Errand both shipped this; failures are documentation. |

### 1.3 Capture what we never did

- **The slide deck.** The brief required it. Build it from `docs/EVIDENCE.md`.
- **Screenshots.** We currently have **zero images** in either README. Capture:
  the containment moment (the single most important frame), the machine panel,
  a verdict, a receipt, and the whole-app view.
- **A poster image** for the repo header — we were the only winner-candidate
  without one.

### 1.4 Make the claims verifiable, and CI real

- **Add CI** (`.github/workflows/`): typecheck, lint, tests, and the attack
  probes. The build must fail if a probe regresses. Ours is currently a number
  someone typed into a README, produced by a manual `cli --probe`. That is not
  evidence a judge can check.
- **Publish a static recorded-runs fallback** (like Airlock's Pages build) so
  the demo URL never 503s and never needs an inference key to show anything.
- **Size the demo for the judging window.** `vc2-4c-8gb`, `MAX_CONCURRENT_SANDBOXES`
  raised, per-IP limits reviewed. A single-seat waiting room is a self-inflicted
  wound at exactly the moment of judging.

---

## Move 2 — Deepen what only we have (1.5 weeks)

Our real asset is not the sandbox — everyone had a sandbox. It's the
**verifier + grounding + receipt** layer, and we were using it as a garnish
instead of as the spine.

### 2.1 gVisor — close the disclosed weakness

Our README tells judges "Docker containers share the host kernel… not a hardware
boundary," then recommends gVisor as the fix. We shipped the weaker mechanism
of the two the brief itself listed. We already built the provider seam that
makes this a config change, not a rewrite.

- Add a `gvisor` provider behind `src/lib/providers/types.ts` (`--runtime=runsc`).
- Re-run all 7 probes under `runsc`; publish both results.
- Compare Docker vs gVisor side by side in `docs/BENCHMARK-RESULTS.md`.

This single change flips our most-cited weakness into a strength. **Do it
before Move 3**, because Move 3's product leans on the containment story.

### 2.2 Verdict into code — and keep the model as second opinion

Today the headline verdict is a model call, and our own README says the
verifier "can be wrong." Both #1 and #2 made "the LLM never decides the
verdict" their headline. We have the better principle and wired it the weaker way.

- **Primary verdict = deterministic**: the grounding check (every figure in the
  prose traced to real stdout) plus a rule table, in code.
- **Verifier = a second opinion** from a different model family, reported
  alongside, with UNCERTAIN as a first-class outcome — never as ground truth.
- Say exactly this in the README. It is a sentence that reads like Airlock's
  and follow-the-money's, because it is the same idea, done better.

### 2.3 Build the harness, not a probe board

7/7 BLOCKED proves containment holds. It does **not** prove the boundary
discriminates. That is the difference between "contains attacks" and
"demonstrably contains attacks," and it is the criterion we're named after.

- Seeded case library with **expected verdicts** (attack → expect BLOCKED;
  benign → expect ALLOWED; borderline → expect INCONCLUSIVE).
- A runner, machine-collected results, a **stated false-negative rate**, and
  documented gaps — not hidden ones.
- **A control group**: prove the harness can tell attack from clean. Errand's
  baseline (password-in-browser 15/15 leaked vs Errand 0/15) is the model.
- **Run it in CI.** Fail the build on a regression.

### 2.4 Make receipts checkable by a third party — **done**

Our HMAC was honest but weak: tamper-evident for whoever holds the key, not
third-party attestation. We said so ourselves — and then left it there.

- **Asymmetric signing (Ed25519), with the public key published.** _(Done —
  both apps, and the primitives live in `packages/evidence`.)_
- **A public verification endpoint**: paste a receipt, get a verdict. No
  secret, no account. _(Done — `POST /api/verify` in both apps.)_
- **Keep the forge-it-and-fail demo.** It's ours alone; nobody else had it.
  _(Kept — and Blindspot has the same thing, on the product surface.)_

### 2.5 Add an egress proxy

Denied connections should be attributable from the proxy log, not just from
sandbox stderr. This is the difference between "the error message said so" and
"the network proves it." Airlock has it.

---

## Move 3 — Raise the ceiling (3–5 weeks)

### 3.1 The product direction

**Turn the verifiable-output machinery into a gate product.**

> Every winner built an agent that _does a task_. None built the thing that
> **audits what agents claim.**

Our grounding check, verifier and receipt already answer exactly one question:
_did this agent's claim actually come from executed output, or did it make it
up?_ That is a question every team deploying agents will need answered — and
it has an unusually well-timed business driver: **AI accountability rules are
arriving and naming exactly these requirements** (traceability, logging,
human oversight, evidence for automated decisions). A product that produces
_per-claim signed evidence_ is a direct answer.

This is differentiated, it is built almost entirely from code we already own,
and it converts our verifier from a garnish into the value proposition.

**Product shape (first wedge):** a _prove-it gate_ for agents that produce
consequential claims about data. The agent runs its work in the sandbox; every
material claim is checked against real executed output; the result is a signed
evidence bundle a regulated team can hand to an auditor.

### 3.2 Choosing the vertical — your call, with criteria

The choice hinges on **access, not elegance.** Business value was our weakest
criterion, and it's worth most when a real person with real consequences is
the user. Pick the domain where you have a real user, real data shape, and a
real reason someone would pay.

Criteria, in order:

1. **You can get a real pilot user.** Non-negotiable. "Potential" users don't score.
2. **A false negative has a price.** Wrong answers must cost something real —
   money, a failed audit, a missed filing, a broken workflow.
3. **A named human must approve a consequential action.** Both money-and-goods
   winners ended with a person approving. Ours should too.
4. **Code execution is genuinely central.** Not a wrapper around an API call.
5. **Not already taken.** Don't rebuild PR review (Airlock) or AP fraud
   (follow-the-money) or purchasing (Errand).

### 3.3 My recommended first wedge

**Compliance & financial-control evidence** — an agent that runs code against
records to produce a findings memo in which every material claim is traced to a
source record, every arithmetic figure is verified against executed output, and
the whole bundle is signed and independently checkable.

Why it fits us:

- **Code execution is central**: the agent writes queries/analysis code and
  runs it in the sandbox. Real Pattern A.
- **False negatives are expensive**: a missed control exception is a failed
  audit, a penalty, a lost contract.
- **Our grounding check is the product, not a feature.** "Every figure traced
  to real output; untraceable figures are flagged" _is_ the deliverable an
  auditor wants.
- **A human signs off**: the evidence bundle goes to a named owner. Human
  oversight, one of the requirements our business driver names.
- **Nobody at the hackathon did it.** Two of three winners were finance-shaped;
  ours would be compliance-shaped and _evidence_-first rather than
  detection-first.
- **Reuses almost everything**: agent loop, sandbox provider (now gVisor),
  grounding, verifier, receipt, SSE, machine panel, 88 tests, the UI.

**Caveat, stated honestly:** if you have a real relationship in a _different_
domain — legal, healthcare ops, logistics, energy, anything with an audit
trail — that domain is likely a better wedge than mine, because a real pilot
user is worth more than a good idea. Mine is the best fit for _our code_; it is
not necessarily the best fit for _our network_.

### 3.4 The workflow layer the winners had and we didn't

Every one of the winners built the parts around the agent. We must too, in the
new vertical:

- A **named user and a job** ("finance controls lead needs X before the run").
- A **place where output must be approved** by a person before it acts.
- A **record that outlives the sandbox** — the run receipt persisted and
  queryable.
- A **distribution surface**: CLI, CI action, and an API with scoped team keys
  (Airlock's team-key model is the reference).
- **Cost visibility**: follow-the-money showed cost per incident live
  ($0.06–0.08). That single detail made the economics real.

---

## What not to do

- **Don't rewrite The Analyst.** The agent loop, provider seam, SSE, receipt,
  grounding, verifier, machine panel and 88 tests are the foundation for
  Move 3. A rewrite throws away the only thing that already worked.
- **Don't do all of this at once.** Move 1 is 3 days; Move 2 is 1.5 weeks;
  Move 3 is 3–5 weeks. Do them in order, with the previous one finished.
- **Don't pivot before Move 1 is done.** A pivot without packaging loses for
  the same reason it lost last time.
- **Don't chase breadth.** No new primitive, no desktop agent, no new character
  in the taxonomy, no manifesto revision. Scope discipline is what we lacked.
- **Don't hide the host-kernel limitation.** Close it (gVisor), then publish the
  result. We were right to disclose and wrong to still be shipping it.
- **Don't resubmit without the deck.** It's a stated deliverable.

---

## Definition of done — the submission gate

Before we submit to anything, again, every line must be true. This checklist
is the direct fix for "we ran out of runway between working and submit-ready."

**Packaging**

- [ ] Repo root opens with: one sentence, one image, live URL, video, run command.
- [ ] `docs/EVIDENCE.md` maps every published criterion → artifact.
- [ ] `docs/JUDGES.md` gives a five-minute path with no archaeology.
- [ ] `docs/CLAIMS.md` links every claim to its evidence.
- [ ] `docs/MODEL_CARD.md`, `docs/BENCHMARK-RESULTS.md`, `docs/FEEDBACK.md` exist.
- [ ] Slide deck built and uploaded.
- [ ] ≥6 real screenshots in the README, including the containment moment.
- [ ] Poster image on the repo.

**Technical**

- [ ] CI runs on every push: typecheck, lint, tests, attack probes. Build fails on a probe regression.
- [ ] gVisor provider live; probes pass under `runsc`; Docker-vs-gVisor comparison published.
- [ ] Expected-verdict harness with a control group; false-negative rate published; gaps documented.
- [ ] Primary verdict computed in code; verifier reported as second opinion.
- [ ] Receipts signed with Ed25519; public verification page; forge-it demo still works.
- [ ] Egress proxy attributing denied connections.
- [ ] Demo box sized for the judging window; static recorded-runs fallback exists.

**Business**

- [ ] Named user, named job, real consequence for a false negative.
- [ ] A human approves the consequential action.
- [ ] Record persists after the sandbox dies.
- [ ] Distribution surface: CLI + CI action + API with scoped team keys.
- [ ] Cost per run shown in the UI.

**Process (the actual lesson)**

- [ ] Packaging frozen and complete **2 days before the deadline**. No feature work after that date.
- [ ] An outsider who wasn't on the team followed `JUDGES.md` without asking us anything.
- [ ] We scored ourselves against this checklist before submitting — and the score is recorded.

---

## The one-line version

We lost a good sandbox to bad packaging. Fix the packaging in three days, turn
the one thing nobody else had — signed, checkable proof that an agent's claims
came from real executed output — into the product, and re-enter with a
submission-shaped repo, a gVisor boundary, a benchmark with a control group,
and a real user.

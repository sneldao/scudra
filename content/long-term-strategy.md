# Long-term strategy — building Scudra with users in mind

**Written:** 2026-11-10 · Sits alongside [`postmortem-agent-rush.md`](postmortem-agent-rush.md) and [`next-steps.md`](next-steps.md).

> **Status (2026-11-10):** Phase 0 and most of Phase 1 are now built. What
> exists today: the case store with the durable/ephemeral split, the signed
> receipt and the public verification endpoint, the product onboarding path,
> the feedback loop, the cost estimate, first-party analytics, the waitlist,
> and the shared `@scudra/evidence` package both apps consume. What is still
> open: a real pilot user, owning the stealth-browser primitive, and the
> expected-verdict harness. See §7.

The hackathon is over. This document re-derives what we learned in light of
one question that the judging rubric never asked: **would anyone use this again
next week, and would anyone pay for it?**

---

## 0. The uncomfortable headline

We have **four apps, zero users, and no way to know either fact.**

There is no analytics, no waitlist, no signup, no pricing, no feedback
mechanism, no user account, and no persistence of any kind. Every run is
in-memory and discarded when the tab closes. A user who runs thirty analyses
has thirty nothing-objects. A user who comes back has no history and no
continuity.

This matters more than anything in the post-mortem. The hackathon loss was a
**packaging and positioning** problem, and it was diagnosable because there was
a rubric telling us what we got wrong. Long term there is no rubric. The
failure mode is silent: we keep shipping beautiful demos into a void, and the
void looks exactly like progress until it doesn't.

So the first lesson of the post-mortem, restated for long-term building:

> **A demo is not a product, and a scoreboard is not a market.**
> Every lesson below is a translation from "how do we win a hackathon" into
> "how do we build something someone depends on."

---

## 1. Which lessons carry over, and which don't

The post-mortem produced good, sharp lessons. Most were aimed at judges.
Here's the honest split.

### Carry over — and they matter _more_ long term

| Hackathon lesson                                                        | Long-term translation                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "The repo root is the product."                                         | **Your landing page is your product.** For a judge, an unclear root README cost us a prize. For a user, an unclear landing page costs you the entire first impression — and users don't read READMEs at all.                                                                                            |
| "Never use the example use case from the brief."                        | **Don't build the framework's tutorial app.** We built "upload a spreadsheet, get a chart" because the brief listed it. That same instinct produces a product anyone can build, which is a product nobody will pay for.                                                                                 |
| "A probe board is not a benchmark."                                     | **Ship your error rate.** Airlock published 18/19 with a documented miss and zero false "safe to merge". That's not judge-facing honesty — that's the thing a professional user needs before trusting an agent with consequential work. We can't publish ours yet because we haven't built the harness. |
| "Let code decide, let models argue."                                    | **Determinism where it matters.** Users will eventually find the case where the model is wrong. Code-verifiable claims survive that; model opinions don't. This is our single strongest asset and we were using it as garnish.                                                                          |
| "Your own Honest Limits section is a scoring risk if the gap is large." | **Close the gaps you disclose.** We told judges "Docker shares the host kernel." For a paying user in a security-adjacent workflow, that's not a footnote — it's the reason they can't sign off.                                                                                                        |
| "A repo is not a submission."                                           | **A repo is not a product either.** Deliverables don't stop at docs; they start at signup.                                                                                                                                                                                                              |
| "Make the demo survive concurrent judges."                              | **Make it survive your users.** Availability is the first product quality anyone experiences. Our demo box was sized to our invoice, not to demand.                                                                                                                                                     |

### Don't carry over

- **Slide decks, `EVIDENCE.md`, poster images, "review this in five minutes"** — these were artifacts of a _scoring rubric_. Build them only if we enter another competition, and keep them separate from the product so they don't rot into the product's shape.
- **"Originality" as a scoring axis.** Long term, originality is a by-product of having a sharp use case, not a goal to optimize directly. Chasing novelty produces demos.
- **Optimizing for a fixed deadline.** The deadline was a forcing function; it also compressed us into single-shot submissions. The fix for long-term is a _different_ kind of discipline (below), not "build faster."

---

## 2. The strategic diagnosis

### 2.1 The lab framing is a marketing asset, not a business model

`Scudra — a lab for cloud-native agents` with a manifesto, a taxonomy (three
primitives, seven characters), and a recipe index is genuinely good thought
leadership. The thesis — _an agent that persists is an agent that can be
profiled; ephemerality is a design principle_ — is sharp, defensible, and
original. It also won us nothing on business value, and it is not a business
model.

**Keep the lab. Stop it being the thing itself.** The lab is top-of-funnel:
research, essays, a public body of work that earns attention and credibility.
The product is a separate, narrow thing underneath it. Concretely: the site
keeps the manifesto, the taxonomy, and the recipes. The product gets its own
front door with its own promise, its own signup, its own pricing, and its own
docs — and it links back to the lab for depth. Today the site _is_ the product
surface, which is why nobody can convert on it.

### 2.2 We have a vendor dependency with a paywall in the middle of our roadmap

This is the most actionable finding, and it only became visible because the
hackathon forced a live run.

- **The Analyst** was deliberately built Vultr-native, with a sandbox-provider
  seam, and it shipped, deployed, and ran live. It is the only app with no
  third-party dependency.
- **Blindspot** (flagship, and the one with real market traction) needs Solari's
  **stealth browser + residential proxy**, which returns `402
FeatureRequiresPlan` on our free plan.
- **The Witness** is code-complete and blocked by the same gate.
- **The Builder** works but is thin.

The pattern is unmistakable: **the one thing we built without the dependency is
the one thing that shipped.** The three winners built _everything_ on Vultr
directly — no intermediary whose free tier could gate our flagship features.

That points at a move I think is right: **own the primitive.**

We already have a provider seam (`src/lib/providers/types.ts`) and a hardened
Docker provider. Implementing a stealth-browser provider on our own stack
(stealth Chromium + a residential egress path) is squarely within our
capabilities, removes the paywall from our roadmap, and converts a recurring
cost + external gate into a capability we own. Errand did effectively this with
Microsandbox microVMs; we can do it with containers + a proxy.

**Decision for you:** pay for the Solari plan, or own the browser primitive.
I'd recommend owning it — it costs us a sprint and permanently removes a
strategic dependency on someone else's pricing decisions. But it's a money-vs-time
call, and it's yours.

### 2.3 The real market is already visible in the repo

We may have already found our user and then walked past it.

**Blindspot targets ENS and Mobula bounties.** That's not a demo audience —
bounty hunters are people who _already spend money_ on exactly this service:
resolving a subject's identity and off-chain context, and doing it without
burning their own infrastructure, their IP, or their anonymity. They have
deadlines, they have budgets, and the work is currently manual.

Compare with **The Analyst**, a CSV question-answering tool with a chart. It's
competent, it's well built, and it is a commodity — ChatGPT and every data
tool does it. Nobody's business depends on our version.

So the asymmetry is: **our least impressive-sounding app has the clearest
users; our most technically impressive app has the least defensible market.**

And notice what Blindspot uniquely has: nobody else has built for the
**investigator** rather than the subject. That's the privacy inversion, and
it's a genuine wedge with a genuine user.

### 2.4 The parts of a product we haven't built at all

Long-term, these are the gap. Note that most of the things that made the
winners' projects look product-shaped — team API keys, write-through
persistence, owner isolation, MCP endpoints, cost-per-run shown live — _look_
like judge candy but are actually **product infrastructure**. That's the
reframe I most want to be right about.

| Missing                             | Why it blocks real use                                                                                                                                                                                                                                                                                                 |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Persistence of any kind**         | Users come back. History, saved runs, and audit trail are the difference between a toy and a tool. Our whole thesis is about not leaving traces — but "no trace" must mean _no trace on the target_, not _no record for the user_. **This distinction is the single most important design decision in this document.** |
| **Accounts, saved work, team keys** | A single person testing an analysis tool isn't a customer. A team that shares runs, keys and history is.                                                                                                                                                                                                               |
| **A feedback signal**               | We have a _self_-check (grounding, verifier). A self-check catches model error. It cannot tell us the agent missed the workflow the user actually cares about. Only the user can.                                                                                                                                      |
| **Analytics**                       | We cannot prioritize without knowing what's used. Right now "what do we build next" is a matter of taste.                                                                                                                                                                                                              |
| **API / CLI / integrations**        | Agents increasingly live inside other agents. If we can't be called programmatically, we're a website.                                                                                                                                                                                                                 |
| **Cost visibility per run**         | follow-the-money showed $0.06–0.08 per incident _in the UI_. That's how you make agent economics legible to a buyer.                                                                                                                                                                                                   |
| **A decision surface**              | Winners had a human approve a consequential action. Users need to review, correct and steer — and their corrections are our training signal.                                                                                                                                                                           |
| **A paid plan and a reason to pay** | Free forever with no monetization path is a research project.                                                                                                                                                                                                                                                          |

---

## 3. The recommendation

### Focus: one product, one user, one wedge

**Recommendation: make Blindspot the product, and make the Analyst its
infrastructure.**

Not two apps. Not a portfolio. The reasoning:

1. **It has real users with real budgets already.** ENS/Mobula bounty hunters.
2. **Our wedge is real and hard to copy**: protecting the _investigator_, not
   the subject — and it can only be built on ephemeral infrastructure, which
   is exactly what we've been building.
3. **It needs everything we already own**: ephemeral sandbox (Mobula calls from
   inside it), stealth browser (off-chain enrichment), the provider seam, and
   the receipt machinery to prove what was actually queried.
4. **It's the app where the thesis is load-bearing.** The Analyst's sandbox
   security is a hygiene property; Blindspot's sandbox ephemerality _is_ the
   product.
5. **It has a natural second user** — investigative journalists, compliance
   teams, and bounty hunters share the same need and the same failure mode
   (don't get profiled by the people you're investigating).

**The Analyst becomes infrastructure, not a product.** Its sandbox provider,
grounding check, verifier, receipt signing, probe board and containment story
are all reused inside Blindspot: "here is the evidence we gathered, each claim
traced to a source, signed, and independently checkable."

**The Witness and The Builder become recipes and demos**, not products. The
Witness's geo-diff is a good _essay with a demo_; it's a great blog post and a
weak business. Parking them in the lab is a legitimate outcome, not a failure.

### The wedge, stated precisely

> **Evidence gathering that leaves the investigator invisible.**
> A subject's onchain and off-chain footprint, assembled in throwaway
> infrastructure that is gone before anyone can correlate it — with a signed
> record of what was found and what was checked, so the conclusion survives
> even though the trail doesn't.

Two halves, deliberately:

- **The invisible half** (ephemeral sandbox + stealth browser + proxy) — the
  differentiator, and the thing only we have.
- **The durable half** (the evidence: what we found, from which source, with
  the reasoning, signed and checkable) — what the user actually keeps, and
  what makes it a product instead of a demo.

This resolves the apparent contradiction in our thesis. We are not against
persistence; we are against _the operator's_ persistence. The target leaves no
trace. The user's evidence survives.

### The audience we are not building for

Say this out loud so we don't drift: not "cloud agent enthusiasts," not
"developers learning about sandboxes," not "the AI agent community." Those are
readers of the lab. Users are people with a **subject to investigate and a
deadline**.

---

## 4. What to build, in order

### Phase 0 — Stop the bleeding (1 week)

Before any new capability.

- **Decide the vendor question** (§2.2): pay for Solari, or own the stealth
  browser. Then unblock Blindspot.
- **Add the smallest possible analytics** — privacy-respecting, self-hosted,
  page + event level: which experiences get visited, which run to completion,
  where they drop off, and whether anyone returns. We currently cannot answer
  a single one of those questions.
- **Put a waitlist + "we're building this, talk to us" on the site.** This
  creates the first channel for finding a real user, and it's an hour of work.
- **Ask the existing audience what they'd pay for.** We have a public repo, a
  manifesto, and a Vultr Community presence. One good question to the right
  people beats six weeks of guessing. Do this _before_ building.

### Phase 1 — Make it usable by a person (2–3 weeks)

- **Persistence.** SQLite, no new infrastructure. Runs, findings, sources,
  verdicts, receipts. This is what makes a returning user a returning user.
  Design it around the thesis: **the subject's data expires; the user's
  evidence doesn't.** Give the user explicit control over how long _their_ case
  data is retained, and default the sensitive raw material to a short TTL.
- **Saved cases, export, shareable report.** The deliverable is a report
  someone can act on, not a 3D dossier animation. The dossier is the lab's
  language; the report is the product's.
- **A real onboarding path.** Paste an ENS name → get a verdict. One field, one
  button, one result. No CSV upload, no suggested prompts, no sample datasets
  in the primary path (keep them as demos).
- **A feedback control on every verdict.** "Wrong / incomplete / right" plus
  free text. This is the cheapest possible research loop and it's the thing
  that turns users into a roadmap.
- **Cost-per-investigation shown live**, like follow-the-money. Users of
  investigative tooling are cost-sensitive professionals; hiding cost is
  hiding a decision.

### Phase 2 — Make it usable by a team (3–4 weeks)

- **Accounts and scoped API keys** — hashed, revocable, per-owner isolation.
  This is what turns "a person using a tool" into "a team depending on it."
- **A real API and a CLI**, with the agent's work reproducible from a script.
- **A decision surface**: the investigator reviews findings, marks them as
  confirmed/unconfirmed/irrelevant, and approves what goes into the final
  report. Their review becomes both a quality signal and a training signal.
- **MCP endpoint** — so an agent can send a Blindspot on an errand. (Errand's
  move, and it's the right one as agents become callers of agents.)
- **Team sharing and a case history** — the durable half, made social.

### Phase 3 — Make it earn (2 weeks)

- **A paid tier with a real unit.** Investigations priced per case or per
  credit. The buyers already have budgets.
- **Cost control** — caching, batching, model routing by task, and a
  hard per-case budget ceiling so a runaway investigation can't cost more than
  the case is worth.
- **The receipts, made external.** Ed25519 signing with a published public key
  and a public verification page. A finding anyone can independently check is
  genuinely differentiating for evidence that might end up in a legal or
  editorial context.
- **A thin compliance surface** — data retention policy, DPA, subprocessor
  list. For investigative and compliance buyers this is table stakes, not a
  feature.

### Phase 4 — The lab (ongoing, never blocked)

- Manifesto revisions as the product ships. This is the thought leadership and
  it compounds.
- **The recipes and the experiences continue** — they are the lab, and they
  are how we attract the audience that eventually converts. The Witness and
  The Builder live here, permanently, and that's fine.
- **A devrelay-style submission surface** — put the product in front of the
  next hackathon, with the judge-facing artifacts from `next-steps.md`
  available but _kept out of the product's shape_.
- Publish what we learn, including the numbers. Our verifiable-output
  machinery is a genuinely interesting artifact in the field.

---

## 5. The new definition of done

The post-mortem's submission gate was the right artifact for a competition.
This is the one for long-term, and it's per **release**, not per deadline.

**For each release, we can answer yes to all of these:**

- [ ] **Someone who isn't us used it**, and we watched them use it.
- [ ] **We learned something we didn't know** before they used it (a drop-off,
      a request, a wrong answer, a question we couldn't answer).
- [ ] **Something persists** that the user would be sad to lose.
- [ ] **The cost of one unit of value is known and bounded.**
- [ ] **One more user could get value without us doing anything.**
- [ ] **The failure modes are measured**, not asserted.
- [ ] **It works from a clean machine** with documented steps.
- [ ] **We can say who it's for**, in one sentence, without hedging.

Note what's missing versus the hackathon gate: no deck, no poster, no
criteria→evidence map, no poster image. Those belong to competitions. Note
also what's _added_: no release ships without a user and a learned fact.

---

## 6. What to stop doing

- **Stop shipping experiences that have no user.** The dossier, the geo-diff,
  the sandbox preview — beautiful, and each one a maintenance liability and a
  distraction. Keep them as lab artifacts; stop treating them as product
  candidates.
- **Stop building before talking to someone.** Phase 0's question comes before
  Phase 1's code. We lost the hackathon partly because we built the brief's
  example; building our own example before talking to a user is the same
  mistake at a larger scale.
- **Stop optimizing for the rubric.** There isn't one. If a decision only
  makes sense if a judge is watching, don't make it.
- **Stop treating the third-party dependency as settled.** Decide it in Phase 0
  and don't let a vendor's pricing page set our roadmap.
- **Stop confusing "ephemeral" with "forgettable."** Our thesis protects the
  _operator_. The user's evidence is theirs to keep. Getting this backwards
  would make the product unusable, so it's the first design decision we make.
- **Stop saying "the whole thing is public" as a strategy.** Open source is
  how we earn trust and attract the audience. It is not a business model, and
  it doesn't create the user relationship we're now trying to build.

---

## 7. One-line version

The hackathon taught us we can build and that judges can find us; long term
the harder lesson is that we've never had a _user_. So: stop adding demos,
stop depending on someone else's free plan, pick the one app where our
thesis is load-bearing and the buyers already exist, and from now on — no
release ships without someone using it and something we learned from them.

### What has actually shipped

| Phase | Item                                                                               | State                      |
| ----- | ---------------------------------------------------------------------------------- | -------------------------- |
| 0     | Waitlist (site → product, first-party)                                             | **Done**                   |
| 0     | First-party analytics (`/api/analytics`, `/api/stats`)                             | **Done**                   |
| 0     | Feedback loop on every verdict (`/api/cases/[id]/feedback`)                        | **Done**                   |
| 0     | Cost per investigation, shown live (`/lib/cost.ts`)                                | **Done**                   |
| 1     | Case store — SQLite, durable/ephemeral split, TTL purge                            | **Done**                   |
| 1     | Signed receipt per case — Ed25519, published public key                            | **Done**                   |
| 1     | Public verification endpoint (`/api/verify`) — no secret, no account               | **Done**                   |
| 1     | Real onboarding path — one field, one button, one result (`/` in `apps/blindspot`) | **Done**                   |
| 1     | Export — JSON and a printable HTML report                                          | **Done**                   |
| 1     | Delete — the user's own evidence, their call                                       | **Done**                   |
| 1     | `@scudra/evidence` shared by both apps (canonical, hashing, signing, grounding)    | **Done**                   |
| 1     | The Analyst's receipts upgraded from HMAC to Ed25519                               | **Done**                   |
| 2     | Accounts, scoped API keys, team sharing, MCP                                       | Not started                |
| 3     | Paid tier, cost control, compliance surface                                        | Not started                |
| 0     | **Own the stealth-browser primitive** (the Solari free-plan 402)                   | **Open — the big one**     |
| 3     | Expected-verdict harness with a control group, in CI                               | Open                       |
| —     | **A real pilot user**                                                              | **Open — the biggest one** |

Two of the three hardest items are still open, and neither is a code problem:
finding a pilot user, and deciding whether to pay a third party for the stealth
browser or own it.

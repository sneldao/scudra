# Post-mortem — Vultr: Agent Rush (Blast Radius Zero)

**Event:** Vultr: Agent Rush Hackathon, 3–8 Nov 2026, lablab.ai × Vultr.
**Track:** Challenge 01 — Blast Radius Zero (Pattern A, sandboxed code execution).
**Entry:** The Analyst (`apps/analyst`), live at `https://scudra.persidian.com`.
**Outcome:** Submitted; did not place in the top 3.
**Post-mortem written:** 2026-11-10, by the build team.

> **Update (later the same day).** Two of the findings below were acted on
> immediately and are no longer true of the code: the receipts are now signed
> with **Ed25519** with the public key published (see "What we got right"
> below and `packages/evidence`), and the grounding check no longer scales
> every number by 100. This document is otherwise left as written, because a
> post-mortem that quietly edits its own conclusions is not a post-mortem.

---

## 1. What actually happened

We shipped a genuinely strong sandbox. We lost anyway. The interesting
question is not "was the tech good enough" — it was. The question is **how we
framed, packaged and evidenced it relative to what the brief asked for and
what the winners did.**

The judging criteria published for the event were four:

1. Application of Technology — how effectively the chosen model(s) are integrated
2. Presentation — clarity and effectiveness of the project presentation
3. Business value — how it improves business areas
4. Originality — uniqueness and creativity of the solution

The prize structure was 1st/2nd/3rd across the whole event, and the field was
large: lablab's live dashboard reported ~92 submissions overall, ~50 of them in
Blast Radius Zero alone, with ~2,600 registered builders. We were competing
against a crowd where **the demo was the product**.

### The scorecard, honestly

| Criterion                 | What we had                                                                                                         | What the winners had                                                                                                                                                                                                                                                                                                                                                                              | Verdict                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Application of Technology | 2 model roles (agent + independent verifier), deterministic grounding check, hard sandbox limits, verified teardown | Airlock: 5 agents, each on a model chosen by live testing, tokens stamped per span. Errand: 4 distinct models incl. a calibrated decisions model and a content-safety model. follow-the-money: 7 agents + LangGraph checkpoints + Durable interrupt. **Plus** far broader Vultr surface: squid egress proxy + gVisor; microVM/KVM + secret-injection runtime; Managed PostgreSQL + Object Storage | **Lost.** We used the narrowest slice of Vultr's portfolio (VM + Serverless Inference only) and the shallowest model ensemble                                                                                                                                                                                                                                                                                |
| Presentation              | Well-written README, live demo, 2-min YouTube video, sticky machine panel                                           | Every winner ships a **judge-facing doc set**: `JUDGES.md` ("review in five minutes"), `CLAIMS.md` ("every claim and its evidence"), `EVIDENCE.md` (criteria → evidence map), `MODEL_CARD.md`, `BENCHMARK-RESULTS.md`, `FEEDBACK.md`, embedded screenshots, a poster image                                                                                                                        | **Lost badly.** We shipped **zero images** in either README and no claims→evidence map. Our README opened on a manifesto                                                                                                                                                                                                                                                                                     |
| Business value            | A CSV/data analyst with a containment demo. No user persona, no workflow, no consequence, no integration surface    | Airlock: CI gate on every PR, team API keys, GitHub App roadmap. follow-the-money: $144,000 exposure, Finance Director approves every action, role enforcement, closure checks, decision memo. Errand: buyer places a real order, held at the browser edge until a person releases it, MCP endpoint                                                                                               | **Lost.** We had no business user and no consequence for being wrong                                                                                                                                                                                                                                                                                                                                         |
| Originality               | Ephemerality thesis, provider seam, HMAC receipts, verifier+grounding                                               | Airlock: PR review with twin base-vs-PR sandboxes. Errand: **destination-bound secret substitution** — the password never enters the guest. follow-the-money: cross-supplier identity discovery                                                                                                                                                                                                   | **Lost, and this is the painful one.** Our repo is a **visible fork of the exact cookbook the organizers seeded** (`forked from solari-sdk/solari-cookbook`, with `examples/` intact) and our flagship use case — "upload a spreadsheet, ask questions, get an executed chart" — is **verbatim the example use case in the brief's own Pattern A list.** On originality we were reading a copy of the prompt |

---

## 2. Root causes

### RC1 — We submitted a lab, not a product

The public repo's front door is `README.md`: _"Scudra — A lab for cloud-native
agents."_ It describes a manifesto, three primitives, a taxonomy and a roadmap
with seven characters. The actual submission — The Analyst — is **one bullet in
a two-item list** under "Featured experience", reachable only by navigating
into `apps/analyst`.

Judges reviewing ~90 submissions under time pressure open the repo root. Ours
said "here is a taxonomy of cloud agents, please go find the thing I built." The
winners each opened with one sentence and one image: _Run the PR before you
trust it_ / _Follow every dollar before it leaves_ / _Your agent works signed in.
It never sees the password._

The whole repo — `apps/site` (marketing site), `apps/blindspot`, `apps/witness`,
`apps/builder`, `content/`, `examples/` — was signal we did not need. It read as
"this team has several half-projects" rather than "this team shipped one thing
deeply."

### RC2 — We lost on the containment _mechanism_, not on the containment _evidence_

Our sandbox is Docker on the same host, sharing the host kernel. We documented
this honestly in our own README's Honest Limits — and then recommended gVisor
as the fix. We shipped the weaker of the two isolation mechanisms the brief
itself recommended (the brief listed `OpenSandbox` and `gVisor` explicitly).

- Airlock shipped **gVisor (`runsc`)** — a kernel boundary — plus a squid
  registry-only egress proxy, so denied connections are attributable.
- Errand shipped **microVMs on KVM** (VX1 nested virtualization) plus a runtime
  that substitutes the real password _outside the guest_, bound to one host.

Meanwhile our evidence was **7 probes, all BLOCKED**. That proves containment
holds. It does _not_ prove the boundary discriminates — that it isn't
over-blocking, that it isn't accidentally passing, that a benchmark of
attack-vs-clean behaves correctly. Airlock shipped a **19-case seeded library
with expected verdicts**, machine-collected on the live deployment, reporting
**18/19 (94.7%) with zero false "safe to merge"** and **one documented gap**.
Errand shipped a **controlled baseline comparison** (browser-holds-password
**15/15 leaked** vs Errand **0/15**, with sign-in still working 3/3).

We had a probe board. They had a benchmark and a control group. For a challenge
whose name is _Blast Radius Zero_, an expected-verdict harness with a
false-negative analysis is the thing that separates "contains attacks" from
"demonstrably contains attacks".

### RC3 — We let the LLM decide a correctness question, and told the judges so

Airlock: _"a deterministic rule table turns the observed facts into the verdict
… the LLM never decides the verdict."_ follow-the-money: _"All money, matching,
policy and closure decisions are code"_, with the Challenge Agent on a
**different model** specifically to argue the innocent side.

Ours: the verdict on whether the output answers the task comes from a **second
model call** (`glm-5.3-flash` for the agent, `deepseek-v4.1-flash` for the
verifier), and our own README says _"the verifier is a model, not a proof — it
can be wrong."_ We built a deterministic grounding check (every figure in the
prose checked against real stdout) — that was right — but we then let the
verifier's PASS/FAIL stand as the headline verdict, with the deterministic check
as support. We had the better pattern and wired it the weaker way.

### RC4 — The submission was assembled at the deadline, so the judge-facing artifacts never existed

The requirement was: public GitHub repo + demo app + **video** + **slide deck**.
We had the repo and the video (published 8 Nov). There is no slide deck, no
PDF, no PPTX anywhere in the repo or in git history. And we have no
judge-facing evidence docs at all — no `JUDGES.md`, no `CLAIMS.md`, no
`EVIDENCE.md`, no `MODEL_CARD.md`, no benchmark results doc.

The commit history tells the story: `docs(analyst): log Analyst deployment to
Vultr VM` (8 Nov) → `feat(site): mark The Analyst live` → `docs: link published
demo video` → `chore: note demo video hosted on YouTube`. The deployment was
the last big milestone. The roadmap entry for the deployment still read
_"Remaining: lablab.ai submission."_ **We ran out of runway between "it works
on a VM" and "a judge can evaluate it in 90 seconds."**

### RC5 — We had no CI, so our strongest claims were unverifiable

Our repo has **no `.github/` directory at all**. Our own `scripts/install-hooks.sh`
installs gitleaks/ruff/tsc as local git hooks — a good instinct, invisible and
unverifiable to a judge. The community showcase entry for this challenge
described the pattern judges were told to expect: _"Seven attack probes run in
CI and the build fails if any one escapes."_

Airlock and Errand both ship a CI badge in the README's first screen. Ours
could not claim the same, because it was true: our 7/7 probe result was a
number someone typed into a README, produced by a manual `cli --probe`.

### RC6 — Our demo box was sized for our budget, not for the judges

The live demo runs on `vc2-1c-1gb` at ~$0.01/hr, with
`MAX_CONCURRENT_SANDBOXES=1` (each sandbox capped at 512 MB, so only one fits
in 1 GB). During judging, if two judges hit the app at once, the second gets a
503 with a "sandboxes busy" message. Winners ran `vc2-4c-8gb`, and Airlock
made its run buttons execute fresh runs on demand, with a **static read-only
site of recorded runs** as a fallback that can never 503.

We optimized for our own cost and handed the judges a single-seat waiting room.
This is a hypothesis, not a verified fact — but it is cheap to fix and expensive
to have been true.

---

## 3. What we got right — and should not throw away

The post-mortem's job is not to talk ourselves out of good work. There is real
work here that the winners do not have, and it should be preserved and
re-framed, not discarded.

- **The honest-limits section is a differentiator.** We published that our
  sandbox shares a host kernel, that our HMAC is tamper-evident but not
  third-party attestation, and that our verifier can be wrong. Winners also
  have Honest Limits sections — so this is at least parity — but ours is more
  specific about its own weakness, which is what makes the rest of the claims
  believable.
- **The provider seam** (`src/lib/providers/types.ts`: create-with-limits →
  exec → idempotent verifiable destroy) is genuinely well-factored, and it is
  the exact seam needed to swap Docker for gVisor or a throwaway Vultr VM.
  That is our fastest path to fixing RC2. _(Update: this seam now lives in
  `packages/evidence` and `packages/sandbox`-shaped code, shared with
  Blindspot.)_
- **Verified teardown + orphan reaping + `finally`-on-every-path** is more
  rigorous than most. Airlock has it too; we should have leaned on it.
- **HMAC-signed receipts with a forge-it-and-fail demo** is a good touch that
  no winner has. _(Update: the HMAC was the weakest part of it — it proved the
  record only to whoever held the secret. Now Ed25519, with the public key
  published, so a third party can check a receipt without a secret at all.)_
- **The grounding check** (every number in the prose must appear in real
  stdout; figures that don't are flagged) is exactly the deterministic
  principle both #1 and #2 made their headline — we just didn't make it ours.
- **88 unit tests including a fake `docker` binary** covering timeouts, OOM vs
  timeout, destroy verification and output caps. Real engineering. It just
  wasn't visible to judges.

---

## 4. The lessons, stated as rules

1. **For a hackathon, the repo root is the product.** One sentence, one image,
   one run command. If the submission is one of several apps, make a
   **submission-shaped repo** (or make the root README _be_ the submission) and
   link out to the lab. A taxonomy is a liability when there are 90 submissions.
2. **Never use the example use case from the brief.** The brief literally
   listed our flagship. If you build the listed example, you have opted out of
   the originality criterion. Take the _shape_ of an example and pick a domain
   with real money, real users and real consequences.
3. **A probe board is not a benchmark.** Ship a seeded case library with
   expected verdicts, a runner, machine-collected results, and a stated
   false-negative rate. And run a **control**: prove the harness can distinguish
   attack from clean.
4. **Your own README's Honest Limits section is a scoring risk if the gap is
   large.** Ours honestly disclosed "Docker shares the host kernel." The fix
   isn't to hide it — it's to _close it_ before submitting, or the disclosure
   reads as a self-inflicted wound on the one criterion the challenge is named
   after.
5. **Let code decide, let models argue.** Every winner made "the LLM never
   decides the verdict" a headline. If a model produces your verdict, you've
   given away a point you could have won in code.
6. **Ship the judge artifacts or lose on presentation.** `JUDGES.md` +
   `CLAIMS.md` + `EVIDENCE.md` (criteria → evidence) + a poster image + embedded
   screenshots + the slide deck. These are ~2 hours of work and they are a
   named judging criterion.
7. **If your demo is the product, the demo must survive 90 concurrent judges.**
   Size the box for the judging window, not the invoice. Ship a static
   recorded-runs fallback so the URL never 503s.
8. **CI is evidence.** If the claim is "the build fails if any one escapes,"
   the build must exist.
9. **Don't post a fork of the seeded cookbook and claim originality.** Fork
   history is visible. If you must fork, re-home the submission and make the
   fork's absence of a decisive commit impossible to miss.
10. **A repo is not a submission.** The deliverable list includes a video and a
    deck. Reserve time for packaging as a first-class workstream, not as the
    last hour before the deadline.

---

## 5. What we do next

Ordered by expected value per hour.

**Before anything else — salvage and re-frame (1–2 days).**

1. Cut a **submission-shaped repo** for The Analyst: root README = one sentence,
   the containment moment, the live URL, the video, the run command, the
   screenshots, `docs/` evidence set. The Scudra lab stays in this repo and
   gets linked from it (or vice versa — but only one is what a judge opens).
2. Write `docs/EVIDENCE.md` mapping each published criterion to the artifact
   that proves it. This is the highest-leverage hour in the whole project.
3. Write `docs/JUDGES.md` — "review this in five minutes" — and `docs/CLAIMS.md`
   — every claim, and the artifact that proves it.
4. Capture the slide deck the brief required and never got.

**Then close the technical gaps that are actually closable (1–2 weeks).** 5. **Move the sandbox to gVisor** (`--runtime=runsc`) behind the provider seam
we already built, and verify the 7 probes still pass under `runsc`. This
converts our biggest documented weakness into a strength. (Note: our own
README already recommends this — we just didn't do it.) 6. **Add an egress proxy** so denied connections are attributable from the proxy
log, not just from sandbox stderr. Airlock has this; it is the difference
between "the error message said so" and "the network proves it." 7. **Build the expected-verdict harness**: a seeded case library with expected
verdicts, a runner, machine-collected results, a stated false-negative rate,
and **run it in CI** so the build fails if any case regresses. 8. **Move the verdict into code.** Keep the verifier as a _second opinion_, but
make the deterministic grounding check + rule table the primary verdict, and
say so in the README.

**Then make it a business (2–4 weeks).** 9. **Pick a vertical with money and consequences** and rebuild the use case
around it. Our own roadmap already had this instinct; we ran out of runway.
A strong candidate that keeps our existing machinery intact: **code review /
"prove it" for a specific role** — or the **API-key-exposure scanner** for
a security team — where a false negative has a price, the workflow has an
owner, and the containment story is the product. 10. **Add the workflow layer the winners have**: a named user, a place where the
agent's output must be _approved_, a record that persists after the sandbox
dies, and a distribution surface (CLI, CI action, API with team keys).

**Then re-enter, bigger.** 11. Re-enter the next Agent Rush (or a comparable track) with the same
containment core, a business framing, a benchmark, a judge doc set, a demo
sized for the judging window, and a repo whose root _is_ the submission. 12. Post to the Vultr Community showcase this time. We skipped the optional
visibility channel entirely.

---

## 6. The one-line version

We built a sandbox that could pass the technical bar and lose it anyway,
because we submitted a _taxonomy_ when the judges wanted a _product_ — and
because our README's most damning sentence ("Docker shares the host kernel")
described a gap we had already written the fix for and hadn't applied.

The tech was never the problem. The packaging, the use case, the isolation
mechanism and the evidence discipline were.

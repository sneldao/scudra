---
version: 1
name: The Analyst
description: An agent that executes — safely. Ask, watch the machine live and die, keep the receipt.
product_thesis: "Where an agent's code runs is the whole security model — so show the machine, the limits, and the proof."
engine: none — editorial 2D, DOM-first
framework: astro (page + layout) with one react island; lib modules are pure TS
colors: { paper: "#faf8f3", ink: "#26262e", accent: "#c26b3f", line: "#e3ddd0", ok: "#3f7d5a", bad: "#b3372c" }
---

# The Analyst — Design Notes

## The product in one sentence

Pick data → ask a question → watch a throwaway machine be born, do real
work, and be destroyed → get an answer, a chart, and a signed receipt.

## Layout: the machine is always on screen

Left column = the work (data, question, answer, trace, receipt).
Right column = **the machine panel**, sticky: BORN → RUNNING → DESTROYED, its
age ticking, its hard limits (network none, secrets 0, memory/CPU/PIDs,
read-only FS), and finally a verdict. Containment is not a footnote — it is
a permanent, live part of the interface. On mobile the machine moves to the top.

## Honest by construction

- The verdict says **Contained** only when destruction was _verified_
  (`docker inspect` fails) and no probe escaped. Otherwise: "Cleanup
  unverified" / "Breach". Logic lives in `runState.verdict()` and is tested.
- Mock mode shows a permanent banner. Mock output is never presented as real.
- A degraded host (no Docker, missing image/keys) shows exactly what is
  missing in a banner; `/api/health` and `cli --doctor` report the same.
- Busy host → a clear 503 message, not a hang.

## The three beats

1. **Answer** — serif, large, the point. Chart below it, with provenance
   ("produced inside the sandbox · sha256 …"). Models explain; they don't invent.
   A verifier badge (pass/fail/uncertain) sits under the answer — a second
   model family judges whether the output actually answers the task, and its
   verdict is signed into the receipt.
2. **How it got there** — collapsible trace: each attempt's code and its real
   output. Failed attempts stay visible; self-repair is a feature, not a secret.
3. **Signed receipt** — hashes of code, output, dataset, artifacts + HMAC.
   "Forge it & verify" flips a field and shows verification fail.

## The containment moment ("Attack the sandbox ⚡")

Seven hostile programs, one stamp each (BLOCKED, rubber-stamp animation), real
evidence beneath. Needs no LLM — only the sandbox — so it works even if
inference is down. Ends in the machine verdict.

## Rules

- Single accent (terracotta). Status green/red are semantic state only.
- No dark mode (Scudra system). Respect `prefers-reduced-motion`.
- All view logic in pure, tested modules (`runState.ts`, `csv.ts`); components render.
- Artifacts are untrusted: strict names, extension allowlist (no SVG/HTML), PNG magic-byte check, size caps.
- Never persist runs, data or receipts server-side. The receipt is the client's copy.

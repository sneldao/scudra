# Code Interpreter — The Analyst

Run untrusted code in an ephemeral sandbox.

## What it does

An LLM on Vultr Serverless Inference writes code, it runs inside a locked-down
Docker sandbox on a Vultr VM, the real stdout comes back, errors are fed back
for a bounded self-repair loop, and the container is destroyed and verified
gone. Every run ends in a signed receipt.

## Primitives

- Sandbox

## Why it matters

LLMs write code, but you should not run it on your own machine. An ephemeral
sandbox is the ideal execution environment for generated or untrusted code.

The essay thesis: _LLMs write code — where it runs is the whole security
model._

**The experience:** untrusted code, staged. The visitor asks a question in
plain English and watches the pipeline run — boot → write → run → explain →
destroy — with a one-click "attack the sandbox" panel that fires seven
hostile programs at the real container and shows the real evidence.

## Foundation

- Primary: Docker on a Vultr Cloud Compute VM + Vultr Serverless Inference (`apps/analyst`)
- Optional secondary: `examples/sandbox-code-interpreter-py` (Solari), via the provider interface

## Status

**Live** — deployed and running at
[`https://scudra.persidian.com`](https://scudra.persidian.com) on a Vultr
Cloud Compute VM, with a demo video. 89 unit tests, including a fake `docker`
binary covering timeouts, OOM vs timeout, destroy verification and output
caps, plus WCAG AA axe checks and browser-verified flows.

Receipts are signed with **Ed25519** and the public key is published at
`GET /api/verify`, so a third party can verify a receipt with no secret. See
[`apps/analyst/README.md`](../../apps/analyst/README.md).

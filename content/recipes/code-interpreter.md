# Code Interpreter — The Analyst

Run untrusted code in an ephemeral sandbox.

## What it does

Spawns a sandbox, executes Python or shell code, and returns the result. The VM is destroyed after the task, so failed or malicious code cannot persist.

## Primitives

- Sandbox

## Why it matters

LLMs write code, but you should not run it on your own machine. An ephemeral sandbox is the ideal execution environment for generated or untrusted code. The essay thesis: _LLMs write code — where it runs is the whole security model._

**The experience (planned): untrusted code, staged.** The visitor pastes code and watches it execute inside a live-visualized ephemeral VM — process tree, filesystem churn, network calls — then watches the VM die. The ephemerality is the spectacle: the teardown moment is the demo.

## Foundation

- Primary: Docker on a Vultr Cloud Compute VM + Vultr Serverless Inference (`apps/analyst`)
- Optional secondary: `examples/sandbox-code-interpreter-py` (Solari), via the provider interface

## Status

In build — [`apps/analyst`](../../apps/analyst). See [`content/roadmap.md`](../roadmap.md).

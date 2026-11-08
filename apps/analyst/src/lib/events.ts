// Events emitted by the orchestrator, consumed by the SSE endpoint and the UI.
//
//   started  → task locks; timeline materializes (carries the run id)
//   sandbox  → a container was born (with its hard limits)
//   writing  → the model produced code (attempt N)
//   result   → REAL output from the sandbox (exit code, stdout, stderr)
//   retry    → the run failed; the error is fed back to the model
//   artifact → a file the program produced (chart, csv) — validated, hashed
//   verdict  → independent verifier judged whether the output answers the task
//   answer   → the model explains the real output
//   probe    → one containment probe outcome (blocked / escaped)
//   teardown → the container is destroyed; `verified` = inspect confirms gone
//   receipt  → signed record of the whole run
//   error    → human sentence

import type { Grounding } from "./grounding.js"
import type { Verification } from "./verify.js"
import type { Artifact, ExecResult } from "./providers/types.js"
import type { Receipt } from "./receipt.js"

export interface SandboxLimits {
  network: "none"
  memoryMb: number
  cpus: number
  pids: number
  execTimeoutMs: number
  lifetimeMs: number
}

export type ProbeStatus = "blocked" | "escaped"

export type AnalystEvent =
  | { type: "started"; runId: string; task: string; mode: "task" | "probe" }
  | { type: "sandbox"; provider: string; sandboxId: string; limits: SandboxLimits; bootMs: number }
  | { type: "writing"; attempt: number; code: string }
  | { type: "running"; attempt: number }
  | { type: "result"; attempt: number; result: ExecResult }
  | { type: "retry"; attempt: number; reason: string }
  | { type: "artifact"; artifact: Artifact }
  | { type: "verdict"; verdict: Verification["verdict"]; reason: string }
  | { type: "answer"; text: string; grounding: Grounding | null }
  | {
      type: "probe"
      index: number
      total: number
      name: string
      description: string
      status: ProbeStatus
      evidence: string
    }
  | { type: "teardown"; sandboxId: string; verified: boolean; lifetimeMs: number }
  | { type: "receipt"; receipt: Receipt }
  | { type: "complete" }
  | { type: "error"; message: string; code?: "busy" | "invalid" | "internal" | "inference" }

export type EventCallback = (event: AnalystEvent) => void

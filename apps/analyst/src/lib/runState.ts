// Pure reducer: folds the SSE event stream into the UI model. All view logic
// that can be wrong lives here, where it is unit-tested; components just render.

import type { Grounding } from "./grounding.js"
import type { Verification } from "./verify.js"
import type { AnalystEvent, SandboxLimits } from "./events.js"
import type { Artifact, ExecResult } from "./providers/types.js"
import type { Receipt } from "./receipt.js"

export type Machine = "none" | "born" | "executing" | "destroyed"

export interface Attempt {
  n: number
  code: string
  result?: ExecResult
  /** Why this attempt was abandoned (feeds the self-repair story). */
  retryReason?: string
}

export interface ProbeResult {
  index: number
  status: "blocked" | "escaped"
  evidence: string
}

export interface RunState {
  phase: "idle" | "running" | "done" | "error" | "cancelled"
  mode: "task" | "probe" | null
  runId: string | null
  task: string
  machine: Machine
  sandbox: { id: string; provider: string; limits: SandboxLimits; bootMs: number } | null
  attempts: Attempt[]
  artifacts: Artifact[]
  answer: string | null
  grounding: Grounding | null
  verification: Verification | null
  probes: ProbeResult[]
  teardown: { verified: boolean; lifetimeMs: number } | null
  receipt: Receipt | null
  error: string | null
}

export const initialRun: RunState = {
  phase: "idle",
  mode: null,
  runId: null,
  task: "",
  machine: "none",
  sandbox: null,
  attempts: [],
  artifacts: [],
  answer: null,
  grounding: null,
  verification: null,
  probes: [],
  teardown: null,
  receipt: null,
  error: null,
}

/** Client-only actions (never sent over the wire). */
export type Action = AnalystEvent | { type: "cancelled" }

export function reduce(s: RunState, e: Action): RunState {
  switch (e.type) {
    case "cancelled":
      return s.phase === "running" ? { ...s, phase: "cancelled" } : s
    case "started":
      return { ...initialRun, phase: "running", mode: e.mode, runId: e.runId, task: e.task }
    case "sandbox":
      return {
        ...s,
        machine: "born",
        sandbox: { id: e.sandboxId, provider: e.provider, limits: e.limits, bootMs: e.bootMs },
      }
    case "writing":
      return { ...s, attempts: [...s.attempts, { n: e.attempt, code: e.code }] }
    case "running":
      return { ...s, machine: "executing" }
    case "result":
      return { ...s, attempts: s.attempts.map((a) => (a.n === e.attempt ? { ...a, result: e.result } : a)) }
    case "retry":
      return { ...s, attempts: s.attempts.map((a) => (a.n === e.attempt ? { ...a, retryReason: e.reason } : a)) }
    case "artifact":
      return { ...s, artifacts: [...s.artifacts, e.artifact] }
    case "verdict":
      return { ...s, verification: { verdict: e.verdict, reason: e.reason } }
    case "answer":
      return { ...s, answer: e.text, grounding: e.grounding }
    case "probe":
      return {
        ...s,
        machine: "executing",
        probes: [...s.probes, { index: e.index, status: e.status, evidence: e.evidence }],
      }
    case "teardown":
      return { ...s, machine: "destroyed", teardown: { verified: e.verified, lifetimeMs: e.lifetimeMs } }
    case "receipt":
      return { ...s, receipt: e.receipt }
    case "complete":
      return { ...s, phase: s.phase === "error" ? "error" : "done" }
    case "error":
      return { ...s, phase: "error", error: e.message }
  }
}

export const blockedCount = (s: RunState) => s.probes.filter((p) => p.status === "blocked").length
export const escapedCount = (s: RunState) => s.probes.filter((p) => p.status === "escaped").length

/** A run is only "contained" if the sandbox was provably destroyed and nothing escaped. */
export function verdict(s: RunState): "contained" | "breach" | "unverified" | null {
  if (!s.teardown) return null
  if (escapedCount(s) > 0) return "breach"
  return s.teardown.verified ? "contained" : "unverified"
}

export const STAGES = ["Boot", "Write", "Run", "Explain", "Destroy"] as const

/**
 * Where a task run is in its pipeline: index into STAGES, STAGES.length when
 * finished, -1 before it starts. Probe runs skip Write/Explain.
 */
export function stageIndex(s: RunState): number {
  if (s.phase === "idle") return -1
  if (s.teardown || s.phase === "done") return STAGES.length
  if (s.machine === "none") return 0
  if (s.answer) return 4
  const last = s.attempts[s.attempts.length - 1]
  if (!last) return 1
  if (last.retryReason) return 1 // self-repair loops back to writing
  if (last.result) return 3
  return 2
}

/** One honest sentence about what is happening now. */
export function statusLine(s: RunState): string {
  if (s.phase === "cancelled") return "Cancelled. The server is destroying the container."
  if (s.phase === "error") return s.error ?? "Something went wrong."
  const i = stageIndex(s)
  if (i <= 0) return "Booting a fresh sandbox…"
  const last = s.attempts[s.attempts.length - 1]
  if (i === 1)
    return last?.retryReason
      ? `Self-repairing — ${last.retryReason.replace(/\.$/, "")}. Sending the real error back to the model…`
      : "The model is writing code…"
  if (i === 2) return `Running attempt ${last?.n ?? 1} inside the sandbox…`
  if (i === 3)
    return s.verification ? "Explaining the real output…" : "A second model is verifying the result against the task…"
  if (i === 4) return "Destroying the sandbox and verifying it is gone…"
  return "Done."
}

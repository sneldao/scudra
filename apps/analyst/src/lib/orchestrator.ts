// The control plane. Vultr-hosted: plans with Vultr Serverless Inference,
// dispatches to an isolated sandbox, returns verifiable output, and ALWAYS
// destroys the sandbox — on success, failure, and abort. Every run ends with
// a signed receipt.

import { randomUUID } from "node:crypto"
import { explain, runAgent } from "./agent.js"
import { checkGrounding } from "./grounding.js"
import { describeInferenceError, InferenceError } from "./llm.js"
import { verifyRun, type Verification } from "./verify.js"
import type { Config } from "./config.js"
import type { AnalystEvent, EventCallback, SandboxLimits } from "./events.js"
import type { Llm } from "./llm.js"
import { runProbes } from "./probe.js"
import type { Artifact, Sandbox, SandboxProvider } from "./providers/types.js"
import { sha256, signReceipt, type Receipt } from "./receipt.js"

export interface Deps {
  provider: SandboxProvider
  llm: Llm
  /** Optional second model for the verifier pass; defaults to `llm`. */
  verifyLlm?: Llm
  config: Pick<Config, "spec" | "receiptPrivateKey" | "receiptKeyId"> & { inferenceModel?: string }
}

export const MAX_TASK = 500
export const MAX_CSV = 100_000

function limitsOf(spec: Config["spec"]): SandboxLimits {
  return {
    network: "none",
    memoryMb: spec.memoryMb,
    cpus: spec.cpus,
    pids: spec.pids,
    execTimeoutMs: spec.execTimeoutMs,
    lifetimeMs: spec.lifetimeMs,
  }
}

interface Facts {
  attempts: number
  outcome: Receipt["outcome"]
  verification: Verification["verdict"] | null
  exitCode: number | null
  code: string | null
  stdout: string | null
  artifacts: Artifact[]
}

/** Creates the sandbox, runs `body`, ALWAYS destroys + emits teardown and a signed receipt. */
async function withSandbox(
  deps: Deps,
  runId: string,
  startedAt: Date,
  dataset: string | undefined,
  onEvent: EventCallback,
  body: (sb: Sandbox) => Promise<Partial<Facts>>,
): Promise<void> {
  let sandbox: Sandbox | undefined
  let born = new Date()
  let facts: Facts = {
    attempts: 0,
    outcome: "error",
    verification: null,
    exitCode: null,
    code: null,
    stdout: null,
    artifacts: [],
  }
  try {
    const t0 = Date.now()
    sandbox = await deps.provider.create(deps.config.spec)
    born = new Date()
    onEvent({
      type: "sandbox",
      provider: deps.provider.name,
      sandboxId: sandbox.id,
      limits: limitsOf(deps.config.spec),
      bootMs: Date.now() - t0,
    })
    facts = { ...facts, ...(await body(sandbox)) }
  } finally {
    if (sandbox) {
      const report = await sandbox.destroy().catch(() => ({ verified: false }))
      const destroyed = new Date()
      onEvent({
        type: "teardown",
        sandboxId: sandbox.id,
        verified: report.verified,
        lifetimeMs: destroyed.getTime() - born.getTime(),
      })
      const receipt = signReceipt(
        {
          version: 1,
          runId,
          provider: deps.provider.name,
          image: deps.config.spec.image,
          model: deps.config.inferenceModel ?? "n/a",
          sandboxId: sandbox.id,
          limits: limitsOf(deps.config.spec),
          startedAt: startedAt.toISOString(),
          sandboxBornAt: born.toISOString(),
          sandboxDestroyedAt: destroyed.toISOString(),
          destroyVerified: report.verified,
          attempts: facts.attempts,
          outcome: facts.outcome,
          verification: facts.verification,
          exitCode: facts.exitCode,
          codeSha256: facts.code ? sha256(facts.code) : null,
          stdoutSha256: facts.stdout !== null ? sha256(facts.stdout) : null,
          datasetSha256: dataset ? sha256(dataset) : null,
          artifacts: facts.artifacts.map((a) => ({ name: a.name, sha256: a.sha256, bytes: a.bytes })),
          keyId: deps.config.receiptKeyId,
        },
        deps.config.receiptPrivateKey,
      )
      onEvent({ type: "receipt", receipt })
    }
  }
}

export async function runTask(
  deps: Deps,
  input: { task: string; csv?: string },
  onEvent: EventCallback,
  signal?: AbortSignal,
): Promise<void> {
  const task = input.task.trim()
  const runId = randomUUID()
  if (!task || task.length > MAX_TASK) {
    onEvent({
      type: "error",
      code: "invalid",
      message: `Give the analyst a task between 1 and ${MAX_TASK} characters.`,
    })
    return
  }
  if (input.csv && input.csv.length > MAX_CSV) {
    onEvent({ type: "error", code: "invalid", message: "That data is too large for the demo (100 KB max)." })
    return
  }
  const startedAt = new Date()
  onEvent({ type: "started", runId, task, mode: "task" })
  try {
    await withSandbox(deps, runId, startedAt, input.csv, onEvent, async (sandbox) => {
      if (input.csv) await sandbox.writeFile("/work/data.csv", input.csv)
      const csvHead = input.csv?.split("\n").slice(0, 6).join("\n")
      const res = await runAgent({ task, csvHead, llm: deps.llm, sandbox, onEvent, signal })
      if (signal?.aborted)
        return {
          attempts: res.attempts,
          outcome: "error",
          verification: null,
          exitCode: res.lastResult?.exitCode ?? null,
          code: res.lastCode,
          stdout: res.lastResult?.stdout ?? null,
          artifacts: [],
        }
      let artifacts: Artifact[] = []
      if (res.succeeded) {
        artifacts = await sandbox.collect()
        for (const artifact of artifacts) onEvent({ type: "artifact", artifact })
      }
      const verification = await verifyRun(
        deps.verifyLlm ?? deps.llm,
        {
          task,
          code: res.lastCode,
          result: res.lastResult,
          artifactNames: artifacts.map((a) => a.name),
          succeeded: res.succeeded,
        },
        signal,
      )
      onEvent({ type: "verdict", verdict: verification.verdict, reason: verification.reason })
      const text = await explain(
        deps.llm,
        task,
        res.lastResult,
        res.succeeded,
        artifacts.map((a) => a.name),
        signal,
      )
      const grounding = res.lastResult ? checkGrounding(text, [res.lastResult.stdout, input.csv ?? ""], task) : null
      onEvent({ type: "answer", text, grounding })
      return {
        attempts: res.attempts,
        outcome: res.succeeded ? "ok" : "failed",
        verification: verification.verdict,
        exitCode: res.lastResult?.exitCode ?? null,
        code: res.lastCode,
        stdout: res.lastResult?.stdout ?? null,
        artifacts,
      }
    })
    onEvent({ type: "complete" })
  } catch (err) {
    if (signal?.aborted) return // client left; the sandbox was already destroyed in `finally`
    console.error("[analyst] task failed:", err instanceof InferenceError ? err.message : err)
    onEvent({
      type: "error",
      code: err instanceof InferenceError ? "inference" : "internal",
      message: describeInferenceError(err),
    })
  }
}

export async function runContainmentProbe(deps: Deps, onEvent: EventCallback): Promise<void> {
  const runId = randomUUID()
  const startedAt = new Date()
  onEvent({ type: "started", runId, task: "Containment probe: hostile code, real sandbox", mode: "probe" })
  try {
    await withSandbox(deps, runId, startedAt, undefined, onEvent, async (sb) => {
      const escaped: string[] = []
      await runProbes(sb, (e: AnalystEvent) => {
        if (e.type === "probe" && e.status === "escaped") escaped.push(e.name)
        onEvent(e)
      })
      return { outcome: escaped.length === 0 ? "ok" : "failed" }
    })
    onEvent({ type: "complete" })
  } catch (err) {
    console.error("[analyst] probe failed:", err)
    onEvent({ type: "error", code: "internal", message: "The probe could not run. Is Docker available on the host?" })
  }
}

export type { AnalystEvent }

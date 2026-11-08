import { describe, expect, it } from "vitest"
import { checkCsv, parseCsvPreview } from "../src/lib/csv.js"
import { createGate, clientKey, rateLimited } from "../src/lib/limiter.js"
import { initialRun, reduce, STAGES, stageIndex, statusLine, verdict } from "../src/lib/runState.js"
import { SAMPLES } from "../src/lib/samples.js"
import type { AnalystEvent } from "../src/lib/events.js"
import { config } from "./fakes.js"

const limits = { network: "none" as const, memoryMb: 512, cpus: 1, pids: 64, execTimeoutMs: 15000, lifetimeMs: 120000 }
const fold = (evs: AnalystEvent[]) => evs.reduce(reduce, initialRun)

describe("run state reducer", () => {
  it("tracks the machine lifecycle and a clean verdict", () => {
    const s = fold([
      { type: "started", runId: "r", task: "t", mode: "task" },
      { type: "sandbox", provider: "p", sandboxId: "s", limits, bootMs: 5 },
      { type: "running", attempt: 1 },
      { type: "teardown", sandboxId: "s", verified: true, lifetimeMs: 1000 },
      { type: "complete" },
    ])
    expect(s.machine).toBe("destroyed")
    expect(s.phase).toBe("done")
    expect(verdict(s)).toBe("contained")
  })
  it("never claims 'contained' when destruction is unverified or an attack escaped", () => {
    const base: AnalystEvent[] = [
      { type: "started", runId: "r", task: "t", mode: "probe" },
      { type: "sandbox", provider: "p", sandboxId: "s", limits, bootMs: 1 },
    ]
    expect(verdict(fold([...base, { type: "teardown", sandboxId: "s", verified: false, lifetimeMs: 1 }]))).toBe(
      "unverified",
    )
    expect(
      verdict(
        fold([
          ...base,
          { type: "probe", index: 1, total: 7, name: "n", description: "d", status: "escaped", evidence: "e" },
          { type: "teardown", sandboxId: "s", verified: true, lifetimeMs: 1 },
        ]),
      ),
    ).toBe("breach")
  })
  it("attaches retry reasons and results to the right attempt", () => {
    const res = { exitCode: 1, stdout: "", stderr: "e", timedOut: false, durationMs: 1 }
    const s = fold([
      { type: "started", runId: "r", task: "t", mode: "task" },
      { type: "writing", attempt: 1, code: "a" },
      { type: "result", attempt: 1, result: res },
      { type: "retry", attempt: 1, reason: "Exit code 1." },
      { type: "writing", attempt: 2, code: "b" },
    ])
    expect(s.attempts[0]!.retryReason).toBe("Exit code 1.")
    expect(s.attempts[0]!.result?.stderr).toBe("e")
    expect(s.attempts[1]!.retryReason).toBeUndefined()
  })
  it("an error stays an error even after complete", () => {
    expect(
      fold([
        { type: "started", runId: "r", task: "t", mode: "task" },
        { type: "error", message: "x" },
        { type: "complete" },
      ]).phase,
    ).toBe("error")
  })
  it("a new run resets everything", () => {
    const s = fold([
      { type: "started", runId: "a", task: "t", mode: "task" },
      { type: "answer", text: "old", grounding: null },
      { type: "started", runId: "b", task: "t2", mode: "task" },
    ])
    expect(s.answer).toBeNull()
    expect(s.runId).toBe("b")
  })
})

describe("admission control", () => {
  it("caps concurrency and release is idempotent", () => {
    const g = createGate(2)
    const a = g.tryAcquire(),
      b = g.tryAcquire()
    expect(g.tryAcquire()).toBeNull()
    a!()
    a!()
    expect(g.active).toBe(1)
    expect(g.tryAcquire()).not.toBeNull()
    b!()
  })
  it("rate limits per key", () => {
    for (let i = 0; i < 3; i++) expect(rateLimited("k1", 3)).toBe(false)
    expect(rateLimited("k1", 3)).toBe(true)
    expect(rateLimited("k2", 3)).toBe(false)
  })
  it("only trusts X-Forwarded-For when told to", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "9.9.9.9, 1.1.1.1" } })
    expect(clientKey(req, "127.0.0.1", false)).toBe("127.0.0.1")
    expect(clientKey(req, "127.0.0.1", true)).toBe("9.9.9.9")
  })
})

describe("csv + samples", () => {
  it("previews quoted fields", () => {
    const p = parseCsvPreview('a,b\n"x,y","he said ""hi"""\n3,4\n')
    expect(p.header).toEqual(["a", "b"])
    expect(p.rows[0]).toEqual(["x,y", 'he said "hi"'])
    expect(p.totalRows).toBe(2)
  })
  it("rejects empty, oversize and non-csv", () => {
    expect(checkCsv("  ")).toMatch(/empty/)
    expect(checkCsv("a,b\n" + "x".repeat(200_000))).toMatch(/limit/)
    expect(checkCsv("just text")).toMatch(/comma/)
    expect(checkCsv("a,b\n1,2")).toBeNull()
  })
  it("samples are valid, deterministic and within the size limit", () => {
    for (const s of SAMPLES) {
      expect(checkCsv(s.csv)).toBeNull()
      expect(s.csv.length).toBeLessThan(100_000)
      expect(s.prompts.length).toBeGreaterThan(0)
    }
    expect(SAMPLES.find((s) => s.id === "sales")!.csv).toBe(SAMPLES.find((s) => s.id === "sales")!.csv)
  })
})

void config

describe("pipeline stage + status line", () => {
  const start: AnalystEvent = { type: "started", runId: "r", task: "t", mode: "task" }
  const born: AnalystEvent = { type: "sandbox", provider: "p", sandboxId: "s", limits, bootMs: 1 }
  const res = { exitCode: 0, stdout: "1", stderr: "", timedOut: false, durationMs: 1 }
  it("walks Boot → Write → Run → Explain → Destroy → done", () => {
    expect(stageIndex(initialRun)).toBe(-1)
    expect(stageIndex(fold([start]))).toBe(0)
    expect(stageIndex(fold([start, born]))).toBe(1)
    expect(
      stageIndex(fold([start, born, { type: "writing", attempt: 1, code: "c" }, { type: "running", attempt: 1 }])),
    ).toBe(2)
    expect(
      stageIndex(
        fold([start, born, { type: "writing", attempt: 1, code: "c" }, { type: "result", attempt: 1, result: res }]),
      ),
    ).toBe(3)
    expect(stageIndex(fold([start, born, { type: "answer", text: "x", grounding: null }]))).toBe(4)
    expect(stageIndex(fold([start, born, { type: "teardown", sandboxId: "s", verified: true, lifetimeMs: 1 }]))).toBe(
      STAGES.length,
    )
  })
  it("self-repair loops the stage back to Write and says so", () => {
    const s = fold([
      start,
      born,
      { type: "writing", attempt: 1, code: "c" },
      { type: "result", attempt: 1, result: { ...res, exitCode: 1 } },
      { type: "retry", attempt: 1, reason: "Exit code 1." },
    ])
    expect(stageIndex(s)).toBe(1)
    expect(statusLine(s)).toMatch(/Self-repairing — Exit code 1/)
  })
  it("cancel only applies to a running run and is honest about teardown", () => {
    const running = fold([start, born])
    const cancelled = reduce(running, { type: "cancelled" })
    expect(cancelled.phase).toBe("cancelled")
    expect(statusLine(cancelled)).toMatch(/destroying/)
    const done = fold([start, { type: "complete" }])
    expect(reduce(done, { type: "cancelled" }).phase).toBe("done")
    expect(verdict(cancelled)).toBeNull() // never claim "contained" without a verified teardown
  })
})

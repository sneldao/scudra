import { describe, expect, it } from "vitest"
import { clip, extractCode, MAX_ATTEMPTS, runAgent } from "../src/lib/agent.js"
import { makeArtifact } from "../src/lib/artifacts.js"
import { runContainmentProbe, runTask } from "../src/lib/orchestrator.js"
import { classify, PROBES } from "../src/lib/probe.js"
import { verifyReceipt } from "../src/lib/receipt.js"
import { bad, collect, config, fakeProvider, ok, py, spec } from "./fakes.js"

describe("agent helpers", () => {
  it("extracts fenced code", () => expect(extractCode("hi\n```python\nprint(1)\n```")).toBe("print(1)"))
  it("returns null without a block", () => expect(extractCode("no code")).toBeNull())
  it("clips long text", () => expect(clip("x".repeat(50), 10)).toContain("40 more chars"))
})

describe("agent loop", () => {
  it("retries with the real error fed back, then succeeds", async () => {
    const { provider } = fakeProvider([bad, ok("42")])
    const sb = await provider.create(spec)
    const seen: string[] = []
    const llm = async (m: { content: string }[]) => (seen.push(m[m.length - 1]!.content), py("print(42)"))
    const { events, on } = collect()
    const r = await runAgent({ task: "t", llm, sandbox: sb, onEvent: on })
    expect(r.succeeded).toBe(true)
    expect(r.attempts).toBe(2)
    expect(seen[1]).toContain("NameError: x")
    expect(events.some((e) => e.type === "retry")).toBe(true)
  })
  it("gives up after MAX_ATTEMPTS", async () => {
    const { provider } = fakeProvider([bad, bad, bad, bad])
    const sb = await provider.create(spec)
    const r = await runAgent({ task: "t", llm: async () => py("x"), sandbox: sb, onEvent: () => {} })
    expect(r.succeeded).toBe(false)
    expect(r.attempts).toBe(MAX_ATTEMPTS)
  })
  it("recovers when the model forgets the code block", async () => {
    const { provider } = fakeProvider([ok("1")])
    const sb = await provider.create(spec)
    let n = 0
    const r = await runAgent({
      task: "t",
      llm: async () => (n++ === 0 ? "sure!" : py("print(1)")),
      sandbox: sb,
      onEvent: () => {},
    })
    expect(r.succeeded).toBe(true)
  })
})

describe("orchestrator", () => {
  it("always destroys the sandbox and still signs a receipt, even when the LLM throws", async () => {
    const { provider, log } = fakeProvider([])
    const { events, on } = collect()
    await runTask(
      {
        provider,
        llm: async () => {
          throw new Error("boom")
        },
        config,
      },
      { task: "x" },
      on,
    )
    expect(log.destroyed).toBe(1)
    const types = events.map((e) => e.type)
    expect(types).toContain("teardown")
    expect(types).toContain("receipt")
    expect(events.at(-1)?.type).toBe("error")
  })
  it("happy path: ordered events, artifact surfaced, receipt valid and binds the artifact", async () => {
    const art = makeArtifact(
      "chart.png",
      "image/png",
      Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(8)]),
    )
    const { provider, log } = fakeProvider([ok("5050")], [art])
    const { events, on } = collect()
    const llm = async (m: { content: string }[]) => {
      const sys = m[0]!.content
      if (sys.startsWith("You are an independent verifier")) return "VERDICT: PASS\nIt answered."
      if (sys.startsWith("You explain")) return "The sum is 5050."
      return py("print(5050)")
    }
    await runTask({ provider, llm, config }, { task: "sum 1..100", csv: "a,b\n1,2\n" }, on)
    expect(events.map((e) => e.type)).toEqual([
      "started",
      "sandbox",
      "writing",
      "running",
      "result",
      "artifact",
      "verdict",
      "answer",
      "teardown",
      "receipt",
      "complete",
    ])
    expect(log.files["/work/data.csv"]).toBe("a,b\n1,2\n")
    expect(log.execs[0]).toContain('os.makedirs("/work/out"')
    const receipt = events.find((e) => e.type === "receipt")!
    if (receipt.type !== "receipt") throw new Error()
    expect(verifyReceipt(receipt.receipt, config.receiptSecret)).toBe(true)
    expect(receipt.receipt.artifacts[0]!.sha256).toBe(art.sha256)
    expect(receipt.receipt.datasetSha256).not.toBeNull()
    expect(receipt.receipt.outcome).toBe("ok")
    const ans = events.find((e) => e.type === "answer")!
    expect(ans.type === "answer" && ans.grounding).toMatchObject({ checked: 1, grounded: 1 })
  })
  it("flags an ungrounded figure in the model's explanation", async () => {
    const { provider } = fakeProvider([ok("5050")])
    const { events, on } = collect()
    const llm = async (m: { content: string }[]) => {
      const sys = m[0]!.content
      if (sys.startsWith("You are an independent verifier")) return "VERDICT: PASS"
      if (sys.startsWith("You explain")) return "The sum is 5050, up 73.2% on last year."
      return py("print(5050)")
    }
    await runTask({ provider, llm, config }, { task: "sum" }, on)
    const ans = events.find((e) => e.type === "answer")!
    expect(ans.type === "answer" && ans.grounding?.ungrounded).toEqual(["73.2"])
  })
  it("does not collect artifacts from a failed run", async () => {
    const { provider } = fakeProvider([bad, bad, bad], [makeArtifact("a.txt", "text/plain", Buffer.from("x"))])
    const { events, on } = collect()
    await runTask({ provider, llm: async () => py("x"), config }, { task: "x" }, on)
    expect(events.some((e) => e.type === "artifact")).toBe(false)
    const r = events.find((e) => e.type === "receipt")
    expect(r && r.type === "receipt" && r.receipt.outcome).toBe("failed")
  })
  it("rejects empty/oversized input without booting a sandbox", async () => {
    const { provider, log } = fakeProvider([])
    const a = collect(),
      b = collect()
    await runTask({ provider, llm: async () => "", config }, { task: "  " }, a.on)
    await runTask({ provider, llm: async () => "", config }, { task: "ok", csv: "x".repeat(100_001) }, b.on)
    expect(a.events[0]?.type).toBe("error")
    expect(b.events[0]?.type).toBe("error")
    expect(log.execs).toHaveLength(0)
    expect(log.destroyed).toBe(0)
  })
})

describe("containment probes", () => {
  it("classifies on the ESCAPED marker", () => {
    expect(classify({ stdout: "ESCAPED: x" })).toBe("escaped")
    expect(classify({ stdout: "BLOCKED: x" })).toBe("blocked")
    expect(classify({ stdout: "" })).toBe("blocked")
  })
  it("runs every probe in order, then tears down and signs", async () => {
    const { provider, log } = fakeProvider(PROBES.map(() => ok("BLOCKED: nope")))
    const { events, on } = collect()
    await runContainmentProbe({ provider, llm: async () => "", config }, on)
    const probes = events.filter((e) => e.type === "probe")
    expect(probes).toHaveLength(PROBES.length)
    expect(probes.map((p) => (p.type === "probe" ? p.index : 0))).toEqual(PROBES.map((_, i) => i + 1))
    expect(log.destroyed).toBe(1)
    expect(events.some((e) => e.type === "receipt")).toBe(true)
  })
  it("a successful escape marks the run failed in the receipt", async () => {
    const results = PROBES.map((_, i) => ok(i === 1 ? "ESCAPED: connected" : "BLOCKED"))
    const { provider } = fakeProvider(results)
    const { events, on } = collect()
    await runContainmentProbe({ provider, llm: async () => "", config }, on)
    const r = events.find((e) => e.type === "receipt")
    expect(r && r.type === "receipt" && r.receipt.outcome).toBe("failed")
  })
})

describe("cancellation + inference errors", () => {
  it("a client abort stops further model calls but still destroys the sandbox", async () => {
    const { provider, log } = fakeProvider([bad, bad, bad])
    const ac = new AbortController()
    let calls = 0
    const llm = async () => (calls++, ac.abort(), py("x"))
    const { on } = collect()
    await runTask({ provider, llm, config }, { task: "x" }, on, ac.signal)
    expect(calls).toBe(1)
    expect(log.destroyed).toBe(1)
  })
  it("surfaces an inference failure as a human sentence, never the upstream body", async () => {
    const { InferenceError } = await import("../src/lib/llm.js")
    const { provider } = fakeProvider([])
    const { events, on } = collect()
    await runTask(
      {
        provider,
        llm: async () => {
          throw new InferenceError("inference 401: sk-SECRET leaked", 401)
        },
        config,
      },
      { task: "x" },
      on,
    )
    const err = events.find((e) => e.type === "error")!
    expect(err.type === "error" && err.code).toBe("inference")
    expect(JSON.stringify(err)).not.toContain("sk-SECRET")
  })
})

import { describe, expect, it } from "vitest"
import { ok, py } from "./fakes.js"
import { parseVerdict, verifyRun, VERIFY_SYSTEM } from "../src/lib/verify.js"
import type { ChatMessage } from "../src/lib/llm.js"

describe("parseVerdict", () => {
  it("reads the verdict line and keeps the reason", () => {
    expect(parseVerdict("VERDICT: PASS\nThe chart shows the requested breakdown.")).toEqual({
      verdict: "pass",
      reason: "The chart shows the requested breakdown.",
    })
    expect(parseVerdict("verdict: fail — wrong column").verdict).toBe("fail")
    expect(parseVerdict("VERDICT: UNCERTAIN\n").verdict).toBe("uncertain")
  })
  it("degrades to uncertain on garbage", () => {
    expect(parseVerdict("I think it looks fine").verdict).toBe("uncertain")
    expect(parseVerdict("").reason).toBe("no reason given")
  })
})

describe("verifyRun", () => {
  const base = { task: "total sales", code: "print(1)", result: ok("42"), artifactNames: [], succeeded: true }
  it("sends the task, code and real output to the verifier", async () => {
    let seen: ChatMessage[] = []
    await verifyRun(
      async (m) => ((seen = m), "VERDICT: PASS\nfine"),
      base,
    )
    expect(seen[0]!.content).toBe(VERIFY_SYSTEM)
    expect(seen[1]!.content).toContain("total sales")
    expect(seen[1]!.content).toContain("42")
  })
  it("returns the parsed verdict", async () => {
    const v = await verifyRun(async () => "VERDICT: FAIL\nIt printed the wrong total.", base)
    expect(v).toEqual({ verdict: "fail", reason: "It printed the wrong total." })
  })
  it("a failed run is uncertain without calling the model", async () => {
    let called = false
    const v = await verifyRun(
      async () => ((called = true), "VERDICT: PASS"),
      { ...base, succeeded: false },
    )
    expect(called).toBe(false)
    expect(v.verdict).toBe("uncertain")
  })
  it("a verifier outage degrades to uncertain, never a silent pass", async () => {
    const v = await verifyRun(
      async () => {
        throw new Error("inference down")
      },
      base,
    )
    expect(v.verdict).toBe("uncertain")
    expect(v.reason).toContain("could not run")
  })
})

describe("orchestrator verifier wiring", () => {
  it("emits a verdict event and signs it into the receipt", async () => {
    const { runTask } = await import("../src/lib/orchestrator.js")
    const { fakeProvider, collect, config } = await import("./fakes.js")
    const { provider } = fakeProvider([ok("5050")])
    const { events, on } = collect()
    const llm = async (m: { content: string }[]) => {
      const sys = m[0]!.content
      if (sys.startsWith("You are an independent verifier")) return "VERDICT: PASS\nIt answered."
      if (sys.startsWith("You explain")) return "The sum is 5050."
      return py("print(5050)")
    }
    await runTask({ provider, llm, config }, { task: "sum" }, on)
    const types = events.map((e) => e.type)
    expect(types.indexOf("verdict")).toBeGreaterThan(types.indexOf("result"))
    expect(types.indexOf("verdict")).toBeLessThan(types.indexOf("answer"))
    const verdict = events.find((e) => e.type === "verdict")
    expect(verdict && verdict.type === "verdict" && verdict.verdict).toBe("pass")
    const receipt = events.find((e) => e.type === "receipt")
    expect(receipt && receipt.type === "receipt" && receipt.receipt.verification).toBe("pass")
  })
  it("uses verifyLlm when provided, not the author model", async () => {
    const { runTask } = await import("../src/lib/orchestrator.js")
    const { fakeProvider, collect, config } = await import("./fakes.js")
    const { provider } = fakeProvider([ok("1")])
    const { events, on } = collect()
    const author = async (m: { content: string }[]) => {
      const sys = m[0]!.content
      if (sys.startsWith("You explain")) return "done."
      return py("print(1)")
    }
    const checker = async () => "VERDICT: FAIL\nWrong answer."
    await runTask({ provider, llm: author, verifyLlm: checker, config }, { task: "x" }, on)
    const verdict = events.find((e) => e.type === "verdict")
    expect(verdict && verdict.type === "verdict" && verdict.verdict).toBe("fail")
  })
})

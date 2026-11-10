import { describe, expect, it } from "vitest"
import { CaseStore } from "../src/lib/store.js"

function store(): CaseStore {
  return new CaseStore({ path: ":memory:" })
}

const sample = {
  id: "case-1",
  ensName: "vitalik.eth",
  address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  riskScore: 62,
  riskLabel: "HIGH RISK",
  summary: "High-risk profile: 1 critical signal(s) detected.",
  signals: [
    {
      category: "pnl",
      label: "Significant realized losses",
      severity: "high" as const,
      detail: "-$50,000",
      sources: ["src-1"],
    },
  ],
  sources: [
    {
      id: "src-1",
      kind: "onchain" as const,
      ref: "mobula://positions",
      title: "Positions",
      excerpt: "realizedPnl -50000",
    },
  ],
  costUsdCents: 4,
  durationMs: 12345,
  receipt: { version: 1, id: "case-1" },
}

describe("case store", () => {
  it("saves and reads back a case", () => {
    const s = store()
    const saved = s.save(sample)
    expect(saved.id).toBe("case-1")
    expect(saved.signals).toHaveLength(1)
    expect(saved.feedback).toBeNull()
    s.close()
  })

  it("preserves signals and sources faithfully", () => {
    const s = store()
    s.save(sample)
    const read = s.get("case-1")!
    expect(read.signals[0].detail).toBe("-$50,000")
    expect(read.sources[0].excerpt).toBe("realizedPnl -50000")
    expect(read.costUsdCents).toBe(4)
    s.close()
  })

  it("returns null for an unknown case", () => {
    const s = store()
    expect(s.get("nope")).toBeNull()
    s.close()
  })

  it("lists most recent first", () => {
    const s = store()
    s.save({ ...sample, id: "a", ensName: "a.eth" })
    s.save({ ...sample, id: "b", ensName: "b.eth" })
    const list = s.list()
    expect(list).toHaveLength(2)
    expect(list[0].id).toBe("b")
    s.close()
  })

  it("bounds the list", () => {
    const s = store()
    for (let i = 0; i < 5; i++) s.save({ ...sample, id: `c${i}`, ensName: "x.eth" })
    expect(s.list(2)).toHaveLength(2)
    s.close()
  })

  it("records feedback", () => {
    const s = store()
    s.save(sample)
    expect(s.setFeedback("case-1", "incomplete", "missed the twitter signal")).toBe(true)
    const read = s.get("case-1")!
    expect(read.feedback).toBe("incomplete")
    expect(read.feedbackNote).toBe("missed the twitter signal")
    expect(read.feedbackAt).not.toBeNull()
    s.close()
  })

  it("returns false when feedback targets an unknown case", () => {
    const s = store()
    expect(s.setFeedback("nope", "right", null)).toBe(false)
    s.close()
  })

  it("deletes a case on request", () => {
    const s = store()
    s.save(sample)
    expect(s.delete("case-1")).toBe(true)
    expect(s.get("case-1")).toBeNull()
    expect(s.delete("case-1")).toBe(false)
    s.close()
  })

  it("keeps the user's evidence when the subject's raw material expires", () => {
    // TTL of 0 hours — everything is already expired.
    const s = new CaseStore({ path: ":memory:", rawTtlHours: 0 })
    s.save(sample)
    const purged = s.purgeExpiredRaw()
    expect(purged).toBe(1)
    const read = s.get("case-1")!
    // The verdict and the signal survive...
    expect(read.riskScore).toBe(62)
    expect(read.signals).toHaveLength(1)
    expect(read.summary).toBe(sample.summary)
    // ...but the raw excerpt is gone.
    expect(read.sources[0].excerpt).toBe("")
    s.close()
  })

  it("does not purge a case whose raw material is still fresh", () => {
    const s = new CaseStore({ path: ":memory:", rawTtlHours: 24 })
    s.save(sample)
    expect(s.purgeExpiredRaw()).toBe(0)
    expect(s.get("case-1")!.sources[0].excerpt).toBe("realizedPnl -50000")
    s.close()
  })

  it("reports usage statistics", () => {
    const s = store()
    s.save(sample)
    s.save({ ...sample, id: "case-2", ensName: "b.eth", costUsdCents: 6 })
    s.setFeedback("case-1", "right", null)
    const stats = s.stats()
    expect(stats.totalCases).toBe(2)
    expect(stats.withFeedback).toBe(1)
    expect(stats.feedbackBreakdown).toEqual({ right: 1 })
    expect(stats.totalCostUsdCents).toBe(10)
    s.close()
  })

  it("records usage events and counts them", () => {
    const s = store()
    s.recordEvent("page.view", { page: "/" })
    s.recordEvent("page.view", { page: "/recipes" })
    s.recordEvent("investigation.completed")
    const counts = s.eventCounts()
    expect(counts["page.view"]).toBe(2)
    expect(counts["investigation.completed"]).toBe(1)
    expect(counts["investigation.failed"]).toBeUndefined()
    s.close()
  })

  it("joins the waitlist once per address", () => {
    const s = store()
    expect(s.addToWaitlist("a@example.com", "scudra.dev")).toBe(true)
    expect(s.addToWaitlist("A@Example.com", "scudra.dev")).toBe(false)
    expect(s.waitlistSize()).toBe(1)
    s.close()
  })

  it("includes the waitlist and events in the operator stats", () => {
    const s = store()
    s.addToWaitlist("a@example.com", null)
    s.recordEvent("page.view")
    const stats = s.stats()
    expect(stats.waitlistSize).toBe(1)
    expect(stats.eventCounts["page.view"]).toBe(1)
    s.close()
  })
})

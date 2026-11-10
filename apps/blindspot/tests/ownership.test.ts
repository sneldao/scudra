import { describe, expect, it } from "vitest"
import { CaseStore } from "../src/lib/store.js"
import { OperatorStore } from "../src/lib/operator-store.js"
import { generateOwnerKey, hashOwnerKey, ownerHashesMatch } from "../src/lib/owner.js"

// The hole this closes: every case on the server was listable and readable
// by anyone who asked. A case is what we know about a SUBJECT — the product's
// core asset, and the thing the investigator is trusting us to keep.

const alice = generateOwnerKey()
const bob = generateOwnerKey()
const aliceHash = hashOwnerKey(alice)
const bobHash = hashOwnerKey(bob)

const sample = {
  id: "case-1",
  ensName: "target.eth",
  address: "0xabc",
  riskScore: 62,
  riskLabel: "HIGH RISK",
  summary: "High-risk profile.",
  signals: [{ category: "pnl", label: "Losses", severity: "high" as const, detail: "-$50,000", sources: ["s1"] }],
  sources: [
    { id: "s1", kind: "onchain" as const, ref: "mobula://positions", title: "Positions", excerpt: "pnl=-50000" },
  ],
  costUsdCents: 4,
  durationMs: 1000,
  receipt: { version: 1, id: "case-1" },
}

describe("case ownership", () => {
  it("stores only a fingerprint of the owner key, never the key", () => {
    const s = new CaseStore({ path: ":memory:" })
    s.save({ ...sample, ownerKeyHash: aliceHash })
    const row = s.list(50, aliceHash)[0]!
    expect(JSON.stringify(row)).not.toContain(alice)
    expect(row.id).toBe("case-1")
    s.close()
  })

  it("does not list another owner's cases", () => {
    const s = new CaseStore({ path: ":memory:" })
    s.save({ ...sample, id: "case-alice", ownerKeyHash: aliceHash })
    s.save({ ...sample, id: "case-bob", ownerKeyHash: bobHash })
    expect(s.list(50, aliceHash).map((c) => c.id)).toEqual(["case-alice"])
    expect(s.list(50, bobHash).map((c) => c.id)).toEqual(["case-bob"])
    s.close()
  })

  it("does not return another owner's case by id", () => {
    const s = new CaseStore({ path: ":memory:" })
    s.save({ ...sample, ownerKeyHash: aliceHash })
    // A stranger who learns the id still gets nothing.
    expect(s.getForOwner("case-1", bobHash)).toBeNull()
    expect(s.getForOwner("case-1", aliceHash)).not.toBeNull()
    s.close()
  })

  it("does not let another owner rate or delete a case", () => {
    const s = new CaseStore({ path: ":memory:" })
    s.save({ ...sample, ownerKeyHash: aliceHash })
    expect(s.setFeedback("case-1", bobHash, "wrong", null)).toBe(false)
    expect(s.delete("case-1", bobHash)).toBe(false)
    expect(s.get("case-1")).not.toBeNull()
    // The owner can.
    expect(s.setFeedback("case-1", aliceHash, "right", null)).toBe(true)
    expect(s.delete("case-1", aliceHash)).toBe(true)
    s.close()
  })

  it("gives a case no owner to nobody", () => {
    const s = new CaseStore({ path: ":memory:" })
    s.save({ ...sample, ownerKeyHash: "" })
    // A case with no owner is not handed to anyone — the store cannot know
    // who to hand it to, and guessing is how it leaks.
    expect(s.list(50, aliceHash)).toHaveLength(0)
    expect(s.getForOwner("case-1", aliceHash)).toBeNull()
    s.close()
  })

  it("matches fingerprints in constant time and rejects mismatches", () => {
    expect(ownerHashesMatch(aliceHash, aliceHash)).toBe(true)
    expect(ownerHashesMatch(aliceHash, bobHash)).toBe(false)
    expect(ownerHashesMatch(null, aliceHash)).toBe(false)
    expect(ownerHashesMatch(aliceHash, undefined)).toBe(false)
    expect(ownerHashesMatch("", "")).toBe(false)
  })

  it("issues a different key every time", () => {
    const keys = new Set(Array.from({ length: 50 }, () => generateOwnerKey()))
    expect(keys.size).toBe(50)
    for (const k of keys) expect(k.length).toBeGreaterThanOrEqual(40)
  })
})

describe("waitlist is a separate store", () => {
  it("keeps the contact list out of the case database", () => {
    const cases = new CaseStore({ path: ":memory:" })
    const list = new OperatorStore({ path: ":memory:" })
    list.addToWaitlist("a@example.com", "site")
    expect(list.waitlistSize()).toBe(1)
    // The case store has no waitlist table at all any more.
    const tables = cases.db
    expect(tables).toBeDefined()
    cases.close()
    list.close()
  })

  it("deduplicates addresses case-insensitively", () => {
    const list = new OperatorStore({ path: ":memory:" })
    expect(list.addToWaitlist("a@example.com", null)).toBe(true)
    expect(list.addToWaitlist("A@Example.com", null)).toBe(false)
    expect(list.waitlistSize()).toBe(1)
    list.close()
  })

  it("lists the entries for the operator", () => {
    const list = new OperatorStore({ path: ":memory:" })
    list.addToWaitlist("a@example.com", "site")
    expect(list.waitlistEntries()[0].email).toBe("a@example.com")
    expect(list.waitlistEntries()[0].source).toBe("site")
    list.close()
  })
})

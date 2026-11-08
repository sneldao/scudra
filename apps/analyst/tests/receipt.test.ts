import { describe, expect, it } from "vitest"
import { canonical, signReceipt, verifyReceipt, type Receipt } from "../src/lib/receipt.js"
import { spec } from "./fakes.js"

const base: Omit<Receipt, "signature"> = {
  version: 1,
  runId: "r1",
  provider: "fake",
  image: spec.image,
  model: "m",
  sandboxId: "s1",
  limits: { network: "none", memoryMb: 512, cpus: 1, pids: 64, execTimeoutMs: 15000, lifetimeMs: 120000 },
  startedAt: "t0",
  sandboxBornAt: "t1",
  sandboxDestroyedAt: "t2",
  destroyVerified: true,
  attempts: 1,
  outcome: "ok",
  verification: "pass",
  exitCode: 0,
  codeSha256: "a",
  stdoutSha256: "b",
  datasetSha256: null,
  artifacts: [],
}
const SECRET = "unit-test-receipt-secret"

describe("receipts", () => {
  it("verifies an untouched receipt", () => expect(verifyReceipt(signReceipt(base, SECRET), SECRET)).toBe(true))
  it("detects tampering with any field", () => {
    const r = signReceipt(base, SECRET)
    expect(verifyReceipt({ ...r, destroyVerified: false }, SECRET)).toBe(false)
    expect(verifyReceipt({ ...r, exitCode: 1 }, SECRET)).toBe(false)
    expect(verifyReceipt({ ...r, artifacts: [{ name: "x.png", sha256: "z", bytes: 1 }] }, SECRET)).toBe(false)
  })
  it("rejects a receipt signed with another secret", () => {
    expect(verifyReceipt(signReceipt(base, "other-secret-xxxxxxxx"), SECRET)).toBe(false)
  })
  it("is stable under key order", () =>
    expect(canonical({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe(canonical({ a: [2, { c: 2, d: 1 }], b: 1 })))
  it("rejects malformed input without throwing", () => {
    for (const x of [null, undefined, {}, "str", { signature: 5 }])
      expect(verifyReceipt(x as never, SECRET)).toBe(false)
  })
})

import { describe, expect, it } from "vitest"
import { canonical, signReceipt, verifyReceipt, type Receipt } from "../src/lib/receipt.js"
import { generateKeyPair, keyId } from "@scudra/evidence"
import { spec } from "./fakes.js"

const keys = generateKeyPair()
const other = generateKeyPair()

const base: Omit<Receipt, "signature" | "keyId"> = {
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

const sign = (r: Omit<Receipt, "signature" | "keyId">, k = keys) =>
  signReceipt({ ...r, keyId: keyId(k.publicKeyPem) }, k.privateKeyPem)

describe("receipts", () => {
  it("verifies an untouched receipt", () => expect(verifyReceipt(sign(base), keys.publicKeyPem)).toBe(true))

  it("detects tampering with any field", () => {
    const r = sign(base)
    expect(verifyReceipt({ ...r, destroyVerified: false }, keys.publicKeyPem)).toBe(false)
    expect(verifyReceipt({ ...r, exitCode: 1 }, keys.publicKeyPem)).toBe(false)
    expect(verifyReceipt({ ...r, artifacts: [{ name: "x.png", sha256: "z", bytes: 1 }] }, keys.publicKeyPem)).toBe(
      false,
    )
  })

  it("rejects a receipt signed by another key", () => {
    const theirs = sign(base, other)
    expect(verifyReceipt(theirs, keys.publicKeyPem)).toBe(false)
    // ...but it names its own signer, so a reader can tell them apart.
    expect(theirs.keyId).not.toBe(sign(base).keyId)
  })

  it("is stable under key order", () =>
    expect(canonical({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe(canonical({ a: [2, { c: 2, d: 1 }], b: 1 })))

  it("rejects malformed input without throwing", () => {
    for (const x of [null, undefined, {}, "str", { signature: 5 }])
      expect(verifyReceipt(x as never, keys.publicKeyPem)).toBe(false)
  })

  it("is verifiable by a third party holding only the public key", () => {
    // The point of Ed25519 over an HMAC: no shared secret is needed.
    const r = sign(base)
    const publicKeyOnly = keys.publicKeyPem
    expect(verifyReceipt(r, publicKeyOnly)).toBe(true)
  })
})

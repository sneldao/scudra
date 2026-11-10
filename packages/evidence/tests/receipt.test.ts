import { describe, expect, it } from "vitest"
import { generateKeyPair, keyId } from "../src/signing.js"
import { signReceipt, verifyReceipt, type Receipt } from "../src/receipt.js"

const keys = generateKeyPair()
const other = generateKeyPair()

function build(overrides: Partial<Parameters<typeof signReceipt>[0]> = {}): Receipt {
  return signReceipt({
    id: "case-1",
    kind: "blindspot-investigation",
    claims: { target: "vitalik.eth", riskScore: 62 },
    observations: { totalValueUSD: 144000, assets: 12 },
    grounding: { checked: 2, grounded: 2, ungrounded: [] },
    privateKeyPem: keys.privateKeyPem,
    publicKeyPem: keys.publicKeyPem,
    keyId: keyId(keys.publicKeyPem),
    ...overrides,
  })
}

describe("receipts", () => {
  it("verifies an untouched receipt", () => {
    const r = build()
    const v = verifyReceipt(r)
    expect(v.signatureValid).toBe(true)
    expect(v.contentIntact).toBe(true)
    expect(v.grounded).toBe(true)
    expect(v.valid).toBe(true)
  })

  it("detects tampering with the claims", () => {
    const r = build()
    const tampered = { ...r, claims: { target: "attacker.eth", riskScore: 1 } } as Receipt
    const v = verifyReceipt(tampered)
    expect(v.signatureValid).toBe(false)
    expect(v.contentIntact).toBe(false)
    expect(v.valid).toBe(false)
  })

  it("detects tampering with the observations", () => {
    const r = build()
    const tampered = { ...r, observations: { totalValueUSD: 1, assets: 12 } } as Receipt
    expect(verifyReceipt(tampered).valid).toBe(false)
  })

  it("detects a swapped signature", () => {
    const r = build()
    const forged = { ...r, signature: build({ id: "case-2" }).signature } as Receipt
    expect(verifyReceipt(forged).signatureValid).toBe(false)
  })

  it("rejects a receipt signed by another key", () => {
    const theirs = build({
      privateKeyPem: other.privateKeyPem,
      publicKeyPem: other.publicKeyPem,
      keyId: keyId(other.publicKeyPem),
    })
    expect(verifyReceipt(theirs).valid).toBe(true)
    // ...but it is bound to that key's id, so a reader can tell them apart.
    expect(theirs.signedBy.keyId).not.toBe(build().signedBy.keyId)
  })

  it("reports an ungrounded claim as not grounded", () => {
    const r = build({ grounding: { checked: 2, grounded: 1, ungrounded: ["999"] } })
    const v = verifyReceipt(r)
    expect(v.signatureValid).toBe(true)
    expect(v.grounded).toBe(false)
    // Not strict: the signature is still valid, the claim is still flagged.
    expect(v.valid).toBe(true)
    // Strict: a third party being asked to rely on it gets a refusal.
    expect(verifyReceipt(r, { strict: true }).valid).toBe(false)
  })

  it("marks itself publishable by default — a receipt is meant to be checked", () => {
    expect(build().audience).toBe("publishable")
  })

  it("carries an explicit audience into the signed body", () => {
    const r = build({ audience: "private" })
    expect(r.audience).toBe("private")
    // The audience is part of what is signed: it cannot be flipped to
    // "publishable" without invalidating the signature.
    expect(verifyReceipt(r).signatureValid).toBe(true)
    expect(verifyReceipt({ ...r, audience: "publishable" }).signatureValid).toBe(false)
  })

  it("does not throw on malformed input", () => {
    for (const bad of [null, undefined, {}, { signature: 5 }]) {
      expect(() => verifyReceipt(bad as never)).not.toThrow()
    }
  })
})

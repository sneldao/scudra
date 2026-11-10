import { describe, expect, it } from "vitest"
import { generateKeyPair, keyId, signDocument, verifyDocument } from "../src/signing.js"

const alice = generateKeyPair()
const bob = generateKeyPair()

describe("asymmetric signing", () => {
  it("verifies a document signed with the matching key", () => {
    const doc = { case: "INC-1", amount: 144000 }
    const sig = signDocument(doc, alice.privateKeyPem)
    expect(verifyDocument(doc, sig, alice.publicKeyPem)).toBe(true)
  })

  it("fails when the document is edited", () => {
    const doc = { case: "INC-1", amount: 144000 }
    const sig = signDocument(doc, alice.privateKeyPem)
    expect(verifyDocument({ ...doc, amount: 140000 }, sig, alice.publicKeyPem)).toBe(false)
  })

  it("fails when the document is edited in a nested field", () => {
    const doc = { case: { id: "INC-1" } }
    const sig = signDocument(doc, alice.privateKeyPem)
    expect(verifyDocument({ case: { id: "INC-2" } }, sig, alice.publicKeyPem)).toBe(false)
  })

  it("fails when verified against a different key", () => {
    const doc = { ok: true }
    const sig = signDocument(doc, alice.privateKeyPem)
    expect(verifyDocument(doc, sig, bob.publicKeyPem)).toBe(false)
  })

  it("is stable under key order", () => {
    const sig = signDocument({ a: 1, b: 2 }, alice.privateKeyPem)
    expect(verifyDocument({ b: 2, a: 1 }, sig, alice.publicKeyPem)).toBe(true)
  })

  it("returns false rather than throwing on malformed input", () => {
    const doc = { ok: true }
    const sig = signDocument(doc, alice.privateKeyPem)
    expect(verifyDocument(doc, "", alice.publicKeyPem)).toBe(false)
    expect(verifyDocument(doc, "not-base64!!", alice.publicKeyPem)).toBe(false)
    expect(verifyDocument(doc, sig, "not-a-key")).toBe(false)
  })

  it("gives each key a distinct, stable id", () => {
    expect(keyId(alice.publicKeyPem)).toBe(keyId(alice.publicKeyPem))
    expect(keyId(alice.publicKeyPem)).not.toBe(keyId(bob.publicKeyPem))
    expect(keyId(alice.publicKeyPem)).toHaveLength(16)
  })
})

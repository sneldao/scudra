import { describe, expect, it } from "vitest"
import { generateKeyPair, keyId, publicKeyFromPrivate } from "@scudra/evidence"

// The exact failure mode a deployment hit: a PEM written into an environment
// variable arrives with literal "\n" sequences, and createPublicKey cannot
// parse that. The symptom was a 500 with an opaque decoder error, an hour
// from the actual cause.

describe("PEM in environment variables", () => {
  const keys = generateKeyPair()

  it("parses a PEM with real newlines", () => {
    expect(() => keyId(keys.publicKeyPem)).not.toThrow()
  })

  it("parses a PEM whose newlines were escaped for an env var", () => {
    const escaped = keys.publicKeyPem.replace(/\n/g, "\\n")
    const expanded = escaped.replace(/\\n/g, "\n")
    expect(() => keyId(expanded)).not.toThrow()
    expect(keyId(expanded)).toBe(keyId(keys.publicKeyPem))
  })

  it("derives the public key from the private one", () => {
    const derived = publicKeyFromPrivate(keys.privateKeyPem)
    expect(keyId(derived)).toBe(keyId(keys.publicKeyPem))
  })

  it("derives the public key from a private key with escaped newlines", () => {
    const escaped = keys.privateKeyPem.replace(/\n/g, "\\n").replace(/\\n/g, "\n")
    expect(() => publicKeyFromPrivate(escaped)).not.toThrow()
  })
})

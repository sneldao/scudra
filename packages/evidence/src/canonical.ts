// Canonical encoding + content hashing.
//
// Two systems that both hold the same document must agree on its byte
// representation before they can agree on its hash or its signature. JSON
// key order is not stable across serializers, so every field is sorted and
// every value is encoded by type.
//
// This is the primitive underneath every receipt in Scudra: a receipt is
// "these facts, hashed and signed". Get the encoding wrong and the signature
// verifies against a different document than the one you meant to sign.

import { createHash } from "node:crypto"

/** Deterministic JSON: sorted keys, so a signature is order-independent. */
export function canonical(value: unknown): string {
  if (value === null) return "null"
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("cannot canonicalize a non-finite number")
    // -0 and 0 are the same value; normalize so they hash identically.
    return JSON.stringify(value === 0 ? 0 : value)
  }
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value)
  // An array's element positions are meaningful, so an undefined element is
  // encoded as null rather than dropped — the same thing JSON.stringify does.
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? "null" : canonical(v))).join(",")}]`
  if (typeof value === "object") {
    const o = value as Record<string, unknown>
    const keys = Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`
  }
  // undefined, functions, symbols — not representable in JSON.
  throw new TypeError(`cannot canonicalize a value of type ${typeof value}`)
}

export const sha256 = (input: string | Buffer): string => createHash("sha256").update(input).digest("hex")

/** Hash of the canonical form — the stable identity of a document. */
export const canonicalHash = (value: unknown): string => sha256(canonical(value))

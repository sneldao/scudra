import { describe, expect, it } from "vitest"
import { canonical, canonicalHash, sha256 } from "../src/canonical.js"

describe("canonical encoding", () => {
  it("is stable under key order", () => {
    expect(canonical({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe(canonical({ a: [2, { c: 2, d: 1 }], b: 1 }))
  })

  it("preserves array order — arrays are ordered data", () => {
    expect(canonical([1, 2])).not.toBe(canonical([2, 1]))
  })

  it("encodes by type, not by string coercion", () => {
    expect(canonical("1")).not.toBe(canonical(1))
    expect(canonical(true)).not.toBe(canonical("true"))
    expect(canonical(null)).not.toBe(canonical("null"))
  })

  it("normalizes -0 to 0 so they hash identically", () => {
    expect(canonicalHash({ v: -0 })).toBe(canonicalHash({ v: 0 }))
  })

  it("drops undefined object fields but keeps them as null in arrays", () => {
    expect(canonical({ a: 1, b: undefined })).toBe('{"a":1}')
    expect(canonical([undefined])).toBe("[null]")
  })

  it("refuses values that have no JSON representation", () => {
    expect(() => canonical({ v: NaN })).toThrow(TypeError)
    expect(() => canonical({ v: Infinity })).toThrow(TypeError)
    expect(() => canonical({ v: () => 1 })).toThrow(TypeError)
  })

  it("hashes the canonical form, so key order cannot change a hash", () => {
    expect(canonicalHash({ a: 1, b: 2 })).toBe(canonicalHash({ b: 2, a: 1 }))
    expect(canonicalHash({ a: 1 })).not.toBe(canonicalHash({ a: 2 }))
  })

  it("hashes strings and buffers identically", () => {
    expect(sha256("abc")).toBe(sha256(Buffer.from("abc")))
  })
})

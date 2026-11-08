import { describe, expect, it } from "vitest"
import { MAX_ARTIFACT_BYTES, parseArtifacts } from "../src/lib/artifacts.js"

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(40, 1)])
const enc = (items: { name: string; buf: Buffer }[]) =>
  JSON.stringify(items.map((i) => ({ name: i.name, b64: i.buf.toString("base64") })))

describe("artifact parsing (untrusted input)", () => {
  it("accepts a real png and a csv, with hashes", () => {
    const a = parseArtifacts(
      enc([
        { name: "chart.png", buf: PNG },
        { name: "result.csv", buf: Buffer.from("a,b\n1,2") },
      ]),
    )
    expect(a.map((x) => x.name)).toEqual(["chart.png", "result.csv"])
    expect(a[0]!.sha256).toHaveLength(64)
  })
  it("rejects a png without the PNG magic bytes", () => {
    expect(parseArtifacts(enc([{ name: "fake.png", buf: Buffer.from("<html>") }]))).toEqual([])
  })
  it("rejects script-capable and unknown types (svg, html, js)", () => {
    for (const n of ["x.svg", "x.html", "x.js", "x"])
      expect(parseArtifacts(enc([{ name: n, buf: Buffer.from("x") }]))).toEqual([])
  })
  it("rejects path-traversal and odd names", () => {
    for (const n of ["../etc/passwd.txt", "a/b.txt", "a b.txt", "..", "x".repeat(80) + ".txt"]) {
      expect(parseArtifacts(enc([{ name: n, buf: Buffer.from("x") }]))).toEqual([])
    }
  })
  it("rejects oversize and empty files", () => {
    expect(parseArtifacts(enc([{ name: "big.txt", buf: Buffer.alloc(MAX_ARTIFACT_BYTES + 1, 65) }]))).toEqual([])
    expect(parseArtifacts(enc([{ name: "empty.txt", buf: Buffer.alloc(0) }]))).toEqual([])
  })
  it("survives garbage output", () => {
    for (const s of ["", "not json", "{}", "null", '[1,"x",null]']) expect(parseArtifacts(s)).toEqual([])
  })
  it("takes the last stdout line (ignores earlier noise)", () => {
    expect(parseArtifacts("warning\n" + enc([{ name: "a.txt", buf: Buffer.from("hi") }]))).toHaveLength(1)
  })
})

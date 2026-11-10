import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { generateReport } from "../src/lib/report.js"
import type { InvestigationReport } from "../src/lib/types.js"

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

// A report with a hostile target name — everything derived from the ENS
// record must be escaped before it reaches the HTML.
function hostileReport(): InvestigationReport {
  return {
    target: {
      name: 'evil" onmouseover="alert(1) eth',
      address: "0xabc",
      avatar: null,
      website: `https://evil.example/' onclick='x`,
      twitter: null,
      github: null,
      discord: null,
      email: null,
      description: "<script>alert(1)</script>",
      aliases: [],
    },
    onchain: {
      portfolio: [],
      positions: [],
      totalValueUSD: 0,
      totalRealizedPnlUSD: 0,
      totalUnrealizedPnlUSD: 0,
    },
    offChain: [],
    risk: {
      overallScore: 42,
      signals: [],
      summary: "summary",
      totalRealizedPnlUSD: 0,
      totalUnrealizedPnlUSD: 0,
      topHoldingShare: 0,
      lowLiquidityCount: 0,
      buyOnlyCount: 0,
      aliasCount: 0,
      unreachableSourceCount: 0,
    },
    privacy: {
      protectedData: [],
      adversaries: [],
      mechanisms: [],
      sandboxId: "sbx-123",
      browserSessionId: "brs-123",
      egressIp: "1.2.3.4",
      sandboxDestroyed: true,
      recordingAvailable: false,
    },
    timestamp: new Date(0).toISOString(),
    duration: 1,
  }
}

describe("generateReport", () => {
  it("writes a self-contained HTML file and returns its path", () => {
    const dir = mkdtempSync(join(tmpdir(), "blindspot-report-"))
    tempDirs.push(dir)

    const path = generateReport(hostileReport(), dir)
    expect(path.startsWith(dir)).toBe(true)
    expect(path.endsWith(".html")).toBe(true)

    const html = readFileSync(path, "utf-8")
    expect(html).toContain("Privacy Manifest")
  })

  it("escapes HTML from the ENS record, including quotes", () => {
    const dir = mkdtempSync(join(tmpdir(), "blindspot-report-"))
    tempDirs.push(dir)

    const path = generateReport(hostileReport(), dir)
    const html = readFileSync(path, "utf-8")

    expect(html).not.toContain("<script>alert(1)</script>")
    expect(html).not.toContain('onmouseover="alert(1)"')
    // Single quotes from the website record are entity-encoded too
    expect(html).not.toContain(`' onclick='x`)
    expect(html).toContain("&quot; onmouseover=&quot;alert(1)")
  })

  it("sanitizes the target name in the filename", () => {
    const dir = mkdtempSync(join(tmpdir(), "blindspot-report-"))
    tempDirs.push(dir)

    const path = generateReport(hostileReport(), dir)
    const name = path.split("/").pop()!
    expect(name.startsWith("blindspot-evil")).toBe(true)
    expect(readdirSync(dir)).toHaveLength(1)
  })
})

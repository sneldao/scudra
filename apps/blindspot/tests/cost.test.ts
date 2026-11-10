import { describe, expect, it } from "vitest"
import { estimateInvestigationCost, estimateInvestigationCostUsdCents } from "../src/lib/cost.js"

describe("cost estimate", () => {
  it("breaks the total down into its parts", () => {
    const breakdown = estimateInvestigationCost()
    expect(breakdown.lines.length).toBeGreaterThan(0)
    const sum = breakdown.lines.reduce((s, l) => s + l.usdCents, 0)
    expect(breakdown.totalUsdCents).toBe(sum)
  })

  it("gives the same figure as the shorthand", () => {
    expect(estimateInvestigationCostUsdCents()).toBe(estimateInvestigationCost().totalUsdCents)
  })

  it("is a positive, whole number of cents", () => {
    const cents = estimateInvestigationCostUsdCents()
    expect(cents).toBeGreaterThan(0)
    expect(Number.isInteger(cents)).toBe(true)
  })

  it("labels every line so the UI can show where the money goes", () => {
    for (const line of estimateInvestigationCost().lines) {
      expect(line.label.length).toBeGreaterThan(0)
      expect(line.usdCents).toBeGreaterThan(0)
    }
  })
})

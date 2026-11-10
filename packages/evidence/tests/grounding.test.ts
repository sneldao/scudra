import { describe, expect, it } from "vitest"
import { checkGrounding } from "../src/grounding.js"

describe("answer grounding", () => {
  it("grounds a number that appears in the evidence", () => {
    const g = checkGrounding("Total value is $144,000", ["totalValueUSD: 144000"], "")
    expect(g.grounded).toBe(1)
    expect(g.ungrounded).toEqual([])
  })

  it("flags a number that does not appear in the evidence", () => {
    const g = checkGrounding("Total value is $999,000", ["totalValueUSD: 144000"], "")
    expect(g.ungrounded).toEqual(["999,000"])
  })

  it("accepts a percentage that matches a fraction", () => {
    const g = checkGrounding("Concentration is 85%", ["topShare: 0.85"], "")
    expect(g.ungrounded).toEqual([])
  })

  it("accepts a fraction that matches a percentage", () => {
    const g = checkGrounding("Concentration is 0.85", ["topShare: 85"], "")
    expect(g.ungrounded).toEqual([])
  })

  it("does not scale unrelated numbers when looking for a match", () => {
    // Regression: 9,999,999 x 100 lands within 0.01% of 1,000,000,000, so a
    // blanket x100 rule made this fabricated figure look grounded.
    const g = checkGrounding("$9,999,999 realized PnL", ["liquidity=1000000000"], "")
    expect(g.ungrounded).toEqual(["9,999,999"])
  })

  it("accepts rounding within one percent", () => {
    const g = checkGrounding("115 records", ["count: 114.7"], "")
    expect(g.ungrounded).toEqual([])
  })

  it("ignores numbers already in the question — they are not claims", () => {
    const g = checkGrounding("There are 12 departments", ["count: 9"], "show me 12 departments")
    expect(g.ungrounded).toEqual([])
  })

  it("ignores bare single-digit integers", () => {
    const g = checkGrounding("Two regions reported", ["regions: 7"], "")
    expect(g.checked).toBe(0)
  })

  it("counts each distinct claim once", () => {
    const g = checkGrounding("$500 and $500 again", ["v: 500"], "")
    expect(g.checked).toBe(1)
    expect(g.grounded).toBe(1)
  })

  it("reports checked and grounded counts", () => {
    const g = checkGrounding("Value 100 and missing 42", ["value: 100"], "")
    expect(g.checked).toBe(2)
    expect(g.grounded).toBe(1)
  })
})

import { describe, expect, it } from "vitest"
import { checkGrounding, extractNumbers } from "../src/lib/grounding.js"

const out = "dept\nEngineering 138.75\nOperations 83.0\nSales 84.33\n"

describe("answer grounding", () => {
  it("extracts plain, decimal, negative and comma-grouped numbers", () => {
    expect(extractNumbers("a 1,200.5 b -3.2 c 42").map((n) => n.value)).toEqual([1200.5, -3.2, 42])
    expect(extractNumbers("v2 and x3.5y")).toEqual([])
  })
  it("passes when every figure is in the output, tolerating rounding", () => {
    const g = checkGrounding(
      "Engineering averages 139 versus 83 for Operations and 84.33 for Sales.",
      [out],
      "avg salary",
    )
    expect(g).toMatchObject({ checked: 3, grounded: 3, ungrounded: [] })
  })
  it("flags an invented number", () => {
    const g = checkGrounding("Engineering averages 138.75, a 47% premium, with 500 staff.", [out], "avg salary")
    expect(g.ungrounded).toEqual(["47", "500"])
  })
  it("matches percentages to fractions and vice versa", () => {
    expect(checkGrounding("Growth was 85%.", ["rate 0.85"], "q").ungrounded).toEqual([])
    expect(checkGrounding("The rate was 0.4", ["share 40"], "q").ungrounded).toEqual([])
  })
  it("does not treat numbers from the user's own question as claims", () => {
    expect(
      checkGrounding("Of the top 25 rows, the first is 138.75.", [out], "show the top 25 rows").ungrounded,
    ).toEqual([])
  })
  it("ignores bare single digits like 'two regions'", () => {
    expect(checkGrounding("There are 3 regions and 138.75 is highest.", [out], "q")).toMatchObject({
      checked: 1,
      grounded: 1,
    })
  })
  it("a 5% mismatch is NOT close enough", () => {
    expect(checkGrounding("The total is 100", ["total 105"], "q").ungrounded).toEqual(["100"])
  })
  it("counts a repeated figure once", () => {
    expect(checkGrounding("It is 77 and again 77.", ["x 77"], "q").checked).toBe(1)
  })
  it("a pure-prose answer has nothing to check", () => {
    expect(checkGrounding("Engineering leads.", [out], "q")).toEqual({ checked: 0, grounded: 0, ungrounded: [] })
  })
})

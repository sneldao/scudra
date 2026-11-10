import { describe, expect, it } from "vitest"
import { describeBrowserFailure } from "../src/lib/orchestrator.js"

describe("describeBrowserFailure", () => {
  it("names the billing condition rather than calling it a bug", () => {
    // Solari answers 402 FeatureRequiresPlan on the free tier.
    const reason = describeBrowserFailure(new Error("HTTP 402: FeatureRequiresPlan — stealth requires a paid plan"))
    expect(reason).toContain("paid Solari plan")
    expect(reason).toContain("402")
  })

  it("recognises a plan error however it is phrased", () => {
    expect(describeBrowserFailure(new Error("upgrade your plan to use this feature"))).toContain("paid Solari plan")
  })

  it("distinguishes bad credentials from a billing problem", () => {
    expect(describeBrowserFailure(new Error("401 unauthorized"))).toContain("credentials")
  })

  it("distinguishes an unreachable service", () => {
    expect(describeBrowserFailure(new Error("fetch failed: ECONNREFUSED"))).toContain("could not be reached")
  })

  it("never leaks a raw upstream body", () => {
    const raw = "a".repeat(500)
    expect(describeBrowserFailure(new Error(raw)).length).toBeLessThanOrEqual(160)
  })

  it("handles a non-Error throw", () => {
    expect(describeBrowserFailure("something odd")).toContain("something odd")
  })
})

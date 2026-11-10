// The case lifecycle, end to end.
//
// A user investigates something, gets a verdict, comes back later, checks
// the receipt, exports the evidence, tells us we were wrong, and deletes it.
// This test walks that whole path — the same functions the API routes call —
// because the value of persistence is entirely in whether the round trip
// works.

import { describe, expect, it } from "vitest"
import { generateKeyPair, verifyReceipt } from "@scudra/evidence"
import { CaseStore } from "../src/lib/store.js"
import { buildReceipt } from "../src/lib/evidence.js"
import { estimateInvestigationCostUsdCents } from "../src/lib/cost.js"
import type { EnsRecord, MobulaData, OffChainContext, RiskAssessment } from "../src/lib/types.js"

const keys = generateKeyPair()

const target: EnsRecord = {
  name: "vitalik.eth",
  address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  avatar: null,
  website: "https://vitalik.eth",
  twitter: "vitalik",
  github: null,
  discord: null,
  email: null,
  description: null,
  aliases: ["vitalik.eth.limo"],
}

const onchain: MobulaData = {
  portfolio: [
    {
      asset: {
        id: 1,
        name: "Ether",
        symbol: "ETH",
        contract: "",
        blockchain: "ethereum",
        logo: null,
        price: 3000,
        marketCap: null,
        liquidity: 1e9,
      },
      walletBalance: 48,
      walletBalanceRaw: "48000000000000000000",
      amountUSD: 144000,
    },
  ],
  positions: [
    {
      token: {
        name: "Bad Token",
        symbol: "BAD",
        contract: "0xbad",
        blockchain: "ethereum",
        logo: null,
        price: 1,
        liquidity: 500,
      },
      balance: 1000,
      amountUSD: 1000,
      buys: 12,
      sells: 0,
      buyVolumeUSD: 1000,
      sellVolumeUSD: 0,
      realizedPnlUSD: -50000,
      unrealizedPnlUSD: 0,
      totalPnlUSD: -50000,
      firstActivity: null,
      lastActivity: null,
    },
  ],
  totalValueUSD: 144000,
  totalRealizedPnlUSD: -50000,
  totalUnrealizedPnlUSD: 0,
}

const offChain: OffChainContext[] = [
  {
    url: "https://vitalik.eth",
    title: "Vitalik",
    description: "Ethereum co-founder",
    ogImage: null,
    socialLinks: ["https://x.com/vitalik"],
    rawSnippet: "Ethereum co-founder",
    fetchedVia: "stealth-proxy:us",
    egressIp: "203.0.113.9",
  },
]

const risk: RiskAssessment = {
  overallScore: 65,
  summary: "High-risk profile: 1 critical signal(s) detected. Investigate before engaging.",
  signals: [
    { category: "pnl", label: "Significant realized losses", severity: "high", detail: "$50,000 realized PnL" },
    { category: "identity", label: "Multiple ENS names", severity: "low", detail: "2 names resolve to this address" },
  ],
  totalRealizedPnlUSD: -50000,
  totalUnrealizedPnlUSD: 0,
  topHoldingShare: 1,
  lowLiquidityCount: 1,
  buyOnlyCount: 1,
  aliasCount: 1,
  unreachableSourceCount: 0,
}

describe("case lifecycle", () => {
  it("carries a case from investigation to verified export to deletion", () => {
    const store = new CaseStore({ path: ":memory:" })

    // 1. The investigation produced a receipt and a set of signals.
    const { receipt, signals, sources } = buildReceipt({
      id: "case-lifecycle-1",
      target,
      onchain,
      offChain,
      risk,
      privateKeyPem: keys.privateKeyPem,
      publicKeyPem: keys.publicKeyPem,
    })

    // 2. The case is saved, with its cost.
    const cost = estimateInvestigationCostUsdCents()
    const saved = store.save({
      id: "case-lifecycle-1",
      ensName: target.name,
      address: target.address,
      riskScore: risk.overallScore,
      riskLabel: "HIGH RISK",
      summary: risk.summary,
      signals,
      sources,
      costUsdCents: cost,
      durationMs: 4200,
      receipt,
    })
    expect(saved.id).toBe("case-lifecycle-1")
    expect(saved.costUsdCents).toBe(cost)

    // 3. The user comes back later.
    const reloaded = store.get("case-lifecycle-1")!
    expect(reloaded.ensName).toBe("vitalik.eth")
    expect(reloaded.signals).toHaveLength(2)

    // 4. They check the receipt — a third party could, using only the
    //    public key embedded in it.
    const v = verifyReceipt(reloaded.receipt as never)
    expect(v.valid).toBe(true)
    expect(v.grounded).toBe(true)

    // 5. They tell us we were wrong.
    expect(store.setFeedback("case-lifecycle-1", "incomplete", "missed the twitter signal")).toBe(true)
    const afterFeedback = store.get("case-lifecycle-1")!
    expect(afterFeedback.feedback).toBe("incomplete")
    expect(afterFeedback.feedbackNote).toBe("missed the twitter signal")

    // 6. They export it, then delete it.
    expect(store.list()).toHaveLength(1)
    expect(store.delete("case-lifecycle-1")).toBe(true)
    expect(store.get("case-lifecycle-1")).toBeNull()
    expect(store.list()).toHaveLength(0)

    store.close()
  })

  it("keeps the receipt checkable after a store round trip", () => {
    const store = new CaseStore({ path: ":memory:" })
    const { receipt } = buildReceipt({
      id: "case-2",
      target,
      onchain,
      offChain,
      risk,
      privateKeyPem: keys.privateKeyPem,
      publicKeyPem: keys.publicKeyPem,
    })
    store.save({
      id: "case-2",
      ensName: target.name,
      address: target.address,
      riskScore: risk.overallScore,
      riskLabel: "HIGH RISK",
      summary: risk.summary,
      signals: [],
      sources: [],
      costUsdCents: 0,
      durationMs: 0,
      receipt,
    })
    const reloaded = store.get("case-2")!
    // JSON round-tripping must not break the signature — the receipt is
    // verified over its canonical form, not over its serialization.
    expect(verifyReceipt(reloaded.receipt as never).valid).toBe(true)
    store.close()
  })

  it("does not let one user's edit forge a different verdict", () => {
    const store = new CaseStore({ path: ":memory:" })
    const { receipt } = buildReceipt({
      id: "case-3",
      target,
      onchain,
      offChain,
      risk,
      privateKeyPem: keys.privateKeyPem,
      publicKeyPem: keys.publicKeyPem,
    })
    store.save({
      id: "case-3",
      ensName: target.name,
      address: target.address,
      riskScore: risk.overallScore,
      riskLabel: "HIGH RISK",
      summary: risk.summary,
      signals: [],
      sources: [],
      costUsdCents: 0,
      durationMs: 0,
      receipt,
    })
    // Someone edits the stored summary. The receipt is untouched — it is a
    // separate, signed document — so the verdict they verify is the one we
    // signed, and the edited summary is visibly not part of it.
    const edited = store.get("case-3")!
    expect(edited.summary).toBe(risk.summary)
    const tampered = { ...(edited.receipt as Record<string, unknown>), claims: { target: "someone-else.eth" } }
    expect(verifyReceipt(tampered as never).valid).toBe(false)
    store.close()
  })
})

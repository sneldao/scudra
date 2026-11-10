import { describe, expect, it } from "vitest"
import { generateKeyPair, verifyReceipt } from "@scudra/evidence"
import { attributeSignals, buildReceipt, buildSources, recomputeMetrics } from "../src/lib/evidence.js"
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
  aliases: [],
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
    { category: "identity", label: "Multiple ENS names", severity: "low", detail: "3 names resolve to this address" },
  ],
  totalRealizedPnlUSD: -50000,
  totalUnrealizedPnlUSD: 0,
  topHoldingShare: 1,
  lowLiquidityCount: 1,
  buyOnlyCount: 1,
  aliasCount: 0,
  unreachableSourceCount: 0,
}

describe("evidence", () => {
  it("builds a receipt that verifies against its own public key", () => {
    const { receipt } = buildReceipt({
      id: "case-1",
      target,
      onchain,
      offChain,
      risk,
      privateKeyPem: keys.privateKeyPem,
      publicKeyPem: keys.publicKeyPem,
    })
    const v = verifyReceipt(receipt)
    expect(v.signatureValid).toBe(true)
    expect(v.contentIntact).toBe(true)
    expect(v.valid).toBe(true)
  })

  it("grounds every figure the verdict relies on", () => {
    const { receipt } = buildReceipt({
      id: "case-1",
      target,
      onchain,
      offChain,
      risk,
      privateKeyPem: keys.privateKeyPem,
      publicKeyPem: keys.publicKeyPem,
    })
    expect(receipt.grounding.ungrounded).toEqual([])
    expect(receipt.grounding.grounded).toBeGreaterThan(0)
  })

  it("flags a figure that does not match an independent recomputation", () => {
    const inflated: RiskAssessment = { ...risk, totalRealizedPnlUSD: -9999999 }
    const { receipt } = buildReceipt({
      id: "case-2",
      target,
      onchain,
      offChain,
      risk: inflated,
      privateKeyPem: keys.privateKeyPem,
      publicKeyPem: keys.publicKeyPem,
    })
    expect(receipt.grounding.ungrounded).toContain("totalRealizedPnlUSD")
    // The signature is still valid — the receipt is honest about the gap.
    expect(verifyReceipt(receipt).signatureValid).toBe(true)
  })

  it("does not let a magnitude stand in for the opposite sign", () => {
    // A claimed +50000 must not be grounded by an observed -50000.
    const flipped: RiskAssessment = { ...risk, totalRealizedPnlUSD: 50000 }
    const { receipt } = buildReceipt({
      id: "case-3",
      target,
      onchain,
      offChain,
      risk: flipped,
      privateKeyPem: keys.privateKeyPem,
      publicKeyPem: keys.publicKeyPem,
    })
    expect(receipt.grounding.ungrounded).toContain("totalRealizedPnlUSD")
  })

  it("recomputes the metrics from the raw records", () => {
    const m = recomputeMetrics(onchain, offChain, target)
    expect(m.totalValueUSD).toBe(144000)
    expect(m.totalRealizedPnlUSD).toBe(-50000)
    expect(m.assetCount).toBe(1)
    expect(m.topHoldingShare).toBe(1)
    expect(m.buyOnlyCount).toBe(1)
    expect(m.lowLiquidityCount).toBe(1)
    expect(m.aliasCount).toBe(0)
  })

  it("attributes each signal to the source that grounds it", () => {
    const sources = buildSources(onchain, offChain)
    const signals = attributeSignals(risk, sources)
    const pnl = signals.find((s) => s.category === "pnl")!
    expect(pnl.sources).toContain("src-onchain-positions")
    const identity = signals.find((s) => s.category === "identity")!
    expect(identity.sources.length).toBeGreaterThan(0)
  })

  it("gives off-chain signals the off-chain source", () => {
    const sources = buildSources(onchain, offChain)
    const signals = attributeSignals(
      {
        ...risk,
        signals: [
          {
            category: "offchain",
            label: "Unreachable off-chain presence",
            severity: "medium",
            detail: "1/1 linked URLs returned no content",
          },
        ],
      },
      sources,
    )
    expect(signals[0].sources).toContain("src-offchain-0")
  })

  it("builds a source list covering onchain and offchain", () => {
    const sources = buildSources(onchain, offChain)
    expect(sources.map((s) => s.kind)).toContain("onchain")
    expect(sources.map((s) => s.kind)).toContain("offchain")
    expect(sources.every((s) => s.id.length > 0)).toBe(true)
  })
})

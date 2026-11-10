// From an investigation to a receipt.
//
// The receipt is what makes a Blindspot finding worth something to someone
// who was not there: an investigator, a journalist, a bounty board, a
// regulator. It has to survive three questions.
//
//   1. Did Scudra produce this?      → Ed25519 signature, public key published.
//   2. Has anything been edited?      → content hash over claims + observations.
//   3. Does the conclusion follow?    → every figure in the verdict is
//                                       recomputed from the raw records and
//                                       compared, in code.
//
// The third one is where most "AI analysis" products are weakest: a fluent
// risk summary whose numbers don't trace back to the data. We compute the
// risk from real records, so we can recompute every figure from those same
// records and check the two agree.
//
// GROUNDING IS METRIC-BASED, NOT PROSE-BASED. A generic number scanner
// cannot tell a material figure from a threshold ("<$10k liquidity"), a
// count, or a rounding constant — and it silently ignores single digits.
// Worse, it compares magnitudes, so "-$50,000 realized" would be "grounded"
// by a "$50,000" balance. Sign matters for money. So the analyzer states
// each figure it relies on BY NAME, and the checker recomputes every metric
// from the raw records by a separate path. Two independent computations
// agreeing is evidence; one computation checking itself is tautology.

import { checkFigures, signReceipt, verifyReceipt, type Figure, type Receipt } from "@scudra/evidence"
import { keyId } from "@scudra/evidence"
import type { EnsRecord, MobulaData, OffChainContext, RiskAssessment } from "./types.js"
import type { StoredSignal, StoredSource } from "./store.js"

export interface EvidenceInput {
  id: string
  target: EnsRecord
  onchain: MobulaData
  offChain: OffChainContext[]
  risk: RiskAssessment
  privateKeyPem: string
  publicKeyPem: string
}

/**
 * The metrics a risk signal can rely on, recomputed from the raw records.
 *
 * This is deliberately a separate implementation from the analyzer's. The
 * analyzer walks the records to reach a verdict; this walks them again to
 * produce the numbers the verdict asserts. If the two disagree, the receipt
 * says so.
 */
export function recomputeMetrics(
  onchain: MobulaData,
  offChain: OffChainContext[],
  target: EnsRecord,
): Record<string, number> {
  const metrics: Record<string, number> = {}

  metrics.totalValueUSD = onchain.portfolio.reduce((sum, a) => sum + (a.amountUSD || 0), 0)
  metrics.totalRealizedPnlUSD = onchain.totalRealizedPnlUSD
  metrics.totalUnrealizedPnlUSD = onchain.totalUnrealizedPnlUSD
  metrics.assetCount = onchain.portfolio.length
  metrics.positionCount = onchain.positions.length
  metrics.aliasCount = target.aliases.length

  // Portfolio concentration — the largest holding's share of the total.
  if (onchain.portfolio.length > 0 && metrics.totalValueUSD > 0) {
    const sorted = [...onchain.portfolio].sort((a, b) => b.amountUSD - a.amountUSD)
    metrics.topHoldingValueUSD = sorted[0].amountUSD
    metrics.topHoldingShare = sorted[0].amountUSD / metrics.totalValueUSD
  }

  // Counts behind the behavioural signals.
  metrics.lowLiquidityCount = onchain.positions.filter(
    (p) => p.token.liquidity !== null && p.token.liquidity < 10000 && p.amountUSD > 100,
  ).length
  metrics.buyOnlyCount = onchain.positions.filter((p) => p.buys > 10 && p.sells === 0).length
  metrics.unreachableSourceCount = offChain.filter((c) => c.title === "" || c.rawSnippet === "").length
  metrics.offChainSourceCount = offChain.length

  return metrics
}

/**
 * The figures the risk assessment relies on, stated by metric name.
 *
 * Derived from the signals themselves, so a signal cannot claim a number it
 * did not use: each figure is the metric that signal's rule reads.
 */
export function figuresForSignals(risk: RiskAssessment): Figure[] {
  const figures: Figure[] = []
  const has = (category: string) => risk.signals.some((s) => s.category === category)

  if (has("portfolio")) {
    figures.push({ metric: "topHoldingShare", value: 0 })
  }
  if (has("pnl")) {
    figures.push({ metric: "totalRealizedPnlUSD", value: risk.totalRealizedPnlUSD })
  }
  if (has("liquidity")) {
    figures.push({ metric: "lowLiquidityCount", value: risk.lowLiquidityCount })
  }
  if (has("behavior")) {
    figures.push({ metric: "buyOnlyCount", value: risk.buyOnlyCount })
  }
  if (has("identity")) {
    figures.push({ metric: "aliasCount", value: risk.aliasCount })
  }
  if (has("offchain")) {
    figures.push({ metric: "unreachableSourceCount", value: risk.unreachableSourceCount })
  }
  return figures
}

/** The sources a signal rests on. A signal with no source is an assertion. */
export function buildSources(onchain: MobulaData, offChain: OffChainContext[]): StoredSource[] {
  const sources: StoredSource[] = [
    {
      id: "src-onchain-portfolio",
      kind: "onchain",
      ref: "mobula://wallet/portfolio",
      title: "Onchain portfolio",
      excerpt: `totalValueUSD=${onchain.totalValueUSD} assets=${onchain.portfolio.length}`,
    },
    {
      id: "src-onchain-positions",
      kind: "onchain",
      ref: "mobula://wallet/positions",
      title: "Onchain positions and PnL",
      excerpt: `realizedPnlUSD=${onchain.totalRealizedPnlUSD} unrealizedPnlUSD=${onchain.totalUnrealizedPnlUSD} positions=${onchain.positions.length}`,
    },
  ]
  offChain.forEach((ctx, i) => {
    sources.push({
      id: `src-offchain-${i}`,
      kind: "offchain",
      ref: ctx.url,
      title: ctx.title || ctx.url,
      excerpt: ctx.description || ctx.rawSnippet.slice(0, 240),
    })
  })
  return sources
}

/**
 * Which source grounds which signal.
 *
 * Each rule names the signal category and the source it must cite. A signal
 * whose source list is empty is an ungrounded assertion and the receipt says
 * so — which is the honest outcome, not a failure to hide.
 */
export function attributeSignals(risk: RiskAssessment, sources: StoredSource[]): StoredSignal[] {
  const has = (id: string) => sources.some((s) => s.id === id)
  return risk.signals.map((signal) => {
    const src: string[] = []
    if (signal.category === "portfolio" || signal.category === "liquidity" || signal.category === "behavior") {
      if (has("src-onchain-portfolio")) src.push("src-onchain-portfolio")
      if (has("src-onchain-positions")) src.push("src-onchain-positions")
    }
    if (signal.category === "pnl") {
      if (has("src-onchain-positions")) src.push("src-onchain-positions")
    }
    if (signal.category === "identity") {
      if (has("src-onchain-portfolio")) src.push("src-onchain-portfolio")
    }
    if (signal.category === "offchain") {
      for (const s of sources) if (s.kind === "offchain") src.push(s.id)
    }
    return {
      category: signal.category,
      label: signal.label,
      severity: signal.severity,
      detail: signal.detail,
      sources: src,
    }
  })
}

/**
 * Build the signed receipt for an investigation.
 *
 * The claims are the verdict and its signals. The observations are the records
 * the verdict was computed from. The grounding result says whether every
 * figure the verdict relies on matches an independent recomputation.
 */
export function buildReceipt(input: EvidenceInput): {
  receipt: Receipt
  signals: StoredSignal[]
  sources: StoredSource[]
} {
  const observed = recomputeMetrics(input.onchain, input.offChain, input.target)
  const sources = buildSources(input.onchain, input.offChain)
  const signals = attributeSignals(input.risk, sources)
  const figures = figuresForSignals(input.risk)
  const grounding = checkFigures(figures, observed)

  const receipt = signReceipt({
    id: input.id,
    kind: "blindspot-investigation",
    claims: {
      target: { name: input.target.name, address: input.target.address, aliases: input.target.aliases },
      riskScore: input.risk.overallScore,
      riskLabel: input.risk.overallScore >= 60 ? "HIGH RISK" : input.risk.overallScore >= 30 ? "MODERATE" : "LOW RISK",
      summary: input.risk.summary,
      signals,
      figures,
    },
    observations: {
      metrics: observed,
      totalValueUSD: input.onchain.totalValueUSD,
      totalRealizedPnlUSD: input.onchain.totalRealizedPnlUSD,
      totalUnrealizedPnlUSD: input.onchain.totalUnrealizedPnlUSD,
      assetCount: input.onchain.portfolio.length,
      positionCount: input.onchain.positions.length,
      sources,
    },
    grounding,
    privateKeyPem: input.privateKeyPem,
    publicKeyPem: input.publicKeyPem,
    keyId: keyId(input.publicKeyPem),
  })

  return { receipt, signals, sources }
}

export { verifyReceipt }

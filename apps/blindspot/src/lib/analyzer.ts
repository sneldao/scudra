// Risk analyzer — combines onchain + off-chain signals into a score.
//
// This is intentionally heuristic, not ML. For a hackathon, transparent rules
// that a judge can read and reason about are more compelling than a black box.

import type { MobulaData, OffChainContext, EnsRecord, RiskAssessment, RiskSignal } from "./types.js"

export function assessRisk(target: EnsRecord, onchain: MobulaData, offChain: OffChainContext[]): RiskAssessment {
  const signals: RiskSignal[] = []

  // The metrics the signals below rely on. Computed once, up front, so the
  // signal rules and the receipt's independent recomputation read the same
  // numbers — and so every figure a signal cites can be shown.
  const totalValueUSD = onchain.portfolio.reduce((sum, a) => sum + (a.amountUSD || 0), 0)
  const sortedPortfolio = [...onchain.portfolio].sort((a, b) => b.amountUSD - a.amountUSD)
  const topHoldingShare =
    totalValueUSD > 0 && sortedPortfolio.length > 0 ? sortedPortfolio[0].amountUSD / totalValueUSD : 0
  const lowLiquidityCount = onchain.positions.filter(
    (p) => p.token.liquidity !== null && p.token.liquidity < 10000 && p.amountUSD > 100,
  ).length
  const buyOnlyCount = onchain.positions.filter((p) => p.buys > 10 && p.sells === 0).length
  const unreachableSourceCount = offChain.filter((c) => c.title === "" || c.rawSnippet === "").length

  // --- Onchain signals ---

  // Portfolio concentration: is everything in one token?
  if (onchain.portfolio.length > 0) {
    if (topHoldingShare > 0.8) {
      signals.push({
        category: "portfolio",
        label: "High concentration",
        severity: "medium",
        detail: `${(topHoldingShare * 100).toFixed(0)}% of portfolio in a single token (${sortedPortfolio[0].asset.symbol})`,
      })
    }
  }

  // PnL: heavy losses could indicate a scam victim or rug survivor
  if (onchain.totalRealizedPnlUSD < -10000) {
    signals.push({
      category: "pnl",
      label: "Significant realized losses",
      severity: "high",
      detail: `$${Math.abs(onchain.totalRealizedPnlUSD).toLocaleString()} realized PnL — possible scam victim or rug survivor`,
    })
  } else if (onchain.totalRealizedPnlUSD > 50000) {
    signals.push({
      category: "pnl",
      label: "Strong realized gains",
      severity: "low",
      detail: `$${onchain.totalRealizedPnlUSD.toLocaleString()} realized PnL — experienced or informed trader`,
    })
  }

  // Low-liquidity tokens: potential scam/honeypot exposure
  if (lowLiquidityCount > 3) {
    signals.push({
      category: "liquidity",
      label: "Multiple low-liquidity positions",
      severity: "medium",
      detail: `${lowLiquidityCount} tokens with <$10k liquidity — elevated honeypot/rug risk`,
    })
  }

  // Trading frequency: high buy count with low sell count = potential bagholder
  if (buyOnlyCount > 2) {
    signals.push({
      category: "behavior",
      label: "Buy-only positions",
      severity: "medium",
      detail: `${buyOnlyCount} tokens bought but never sold — bag holder pattern`,
    })
  }

  // --- ENS identity signals ---

  // Multiple aliases: could be legitimate (rebranding) or suspicious (sybil)
  if (target.aliases.length > 2) {
    signals.push({
      category: "identity",
      label: "Multiple ENS names",
      severity: "low",
      detail: `${target.aliases.length + 1} names resolve to this address: ${[target.name, ...target.aliases].join(", ")}`,
    })
  }

  // No ENS text records at all: either privacy-conscious or new/abandoned
  const hasRecords = target.website || target.twitter || target.github || target.description
  if (!hasRecords) {
    signals.push({
      category: "identity",
      label: "No ENS text records",
      severity: "low",
      detail: "No website, social, or description set — privacy-conscious or inactive identity",
    })
  }

  // --- Off-chain signals ---

  // Website unreachable or empty
  if (unreachableSourceCount > 0 && offChain.length > 0) {
    signals.push({
      category: "offchain",
      label: "Unreachable off-chain presence",
      severity: "medium",
      detail: `${unreachableSourceCount}/${offChain.length} linked URLs returned no content — dead links or abandoned project`,
    })
  }

  // No off-chain presence at all
  if (offChain.length === 0) {
    signals.push({
      category: "offchain",
      label: "No verifiable off-chain presence",
      severity: "medium",
      detail: "ENS name has no linked website or socials that could be enriched — anonymous actor",
    })
  }

  // --- Score calculation ---
  const weights = { low: 10, medium: 25, high: 40 }
  const rawScore = signals.reduce((sum, s) => sum + weights[s.severity], 0)
  const overallScore = Math.min(100, rawScore)

  const highCount = signals.filter((s) => s.severity === "high").length
  const summary =
    highCount > 0
      ? `High-risk profile: ${highCount} critical signal(s) detected. Investigate before engaging.`
      : overallScore > 40
        ? "Moderate risk: several cautionary signals. Proceed with due diligence."
        : "Low-risk profile: no critical signals. Standard caution applies."

  return {
    overallScore,
    signals,
    summary,
    totalRealizedPnlUSD: onchain.totalRealizedPnlUSD,
    totalUnrealizedPnlUSD: onchain.totalUnrealizedPnlUSD,
    topHoldingShare,
    lowLiquidityCount,
    buyOnlyCount,
    aliasCount: target.aliases.length,
    unreachableSourceCount,
  }
}

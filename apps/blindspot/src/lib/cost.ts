// What an investigation costs.
//
// follow-the-money showed the cost of a run live in the UI and that single
// detail did more for its business case than any amount of prose: a buyer
// of investigative tooling is cost-sensitive, and hiding the cost hides the
// decision.
//
// The numbers are the published list prices of the services an investigation
// touches, in USD cents so we never do float arithmetic on money.
//
// IMPORTANT: these are ESTIMATES for a single investigation, and the estimate
// is deliberately coarse. Two Mobula calls, one sandbox, one browser session.
// What it is not is a promise — actual billing is the provider's, and the
// per-case figure we store is the estimate, not an invoice.

const MOBULA_CALL_USD_CENTS = 1 // per API call
const MOBULA_CALLS = 2 // portfolio + positions
const SANDBOX_USD_CENTS = 1 // ~1s of ephemeral compute
const BROWSER_USD_CENTS = 2 // ~10s of stealth browser egress

export interface CostBreakdown {
  totalUsdCents: number
  lines: { label: string; usdCents: number }[]
}

/**
 * Estimate the cost of one investigation.
 *
 * Returns a breakdown so the UI can show WHERE the money goes, not just a
 * number. A user who cannot see the breakdown cannot budget.
 */
export function estimateInvestigationCost(): CostBreakdown {
  const lines = [
    { label: `Mobula data (${MOBULA_CALLS} calls)`, usdCents: MOBULA_CALL_USD_CENTS * MOBULA_CALLS },
    { label: "Ephemeral sandbox", usdCents: SANDBOX_USD_CENTS },
    { label: "Stealth browser egress", usdCents: BROWSER_USD_CENTS },
  ]
  return {
    totalUsdCents: lines.reduce((sum, l) => sum + l.usdCents, 0),
    lines,
  }
}

export function estimateInvestigationCostUsdCents(): number {
  return estimateInvestigationCost().totalUsdCents
}

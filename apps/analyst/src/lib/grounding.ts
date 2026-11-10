// Answer grounding — re-exported from @scudra/evidence.
//
// The check itself lives in the shared package because Blindspot grounds its
// verdicts with the same discipline (every figure must trace to something
// that was actually observed). One implementation, one set of rules, one
// place to fix a bug.
//
// What it does: does every figure the model states appear in the real output?
// The model explains results; it must not invent numbers. Deterministic —
// not another model call.
//
// Deliberately lenient where honesty allows (so it isn't noisy), strict where
// it matters:
//   • numerically equal counts (115 matches 115.0; 1,200 matches 1200)
//   • within 1% (rounding: 114.7 → "115")
//   • percentages: "85%" matches 0.85
//   • numbers already in the user's own question are not "claims"
//   • bare single-digit integers are ignored ("two regions") — the one blind
//     spot, documented in the README.

export { checkGrounding, extractNumbers } from "@scudra/evidence"
export type { Grounding } from "@scudra/evidence"

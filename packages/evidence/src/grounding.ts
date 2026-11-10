// Answer grounding: does every figure the model states appear in the real
// output? The model explains results; it must not invent numbers. This is a
// deterministic check, not another model call.
//
// Deliberately lenient where honesty allows (so it isn't noisy), strict where
// it matters:
//   • numerically equal counts (115 matches 115.0; 1,200 matches 1200)
//   • within 1% (rounding: 114.7 → "115")
//   • percentages: "85%" matches 0.85
//   • numbers already in the user's own question are not "claims"
//   • bare single-digit integers are ignored ("two regions") — the one blind
//     spot, documented in the README.
//
// Shared by the Analyst (grounding a model-written answer against program
// stdout) and by Blindspot (grounding a risk narrative against the onchain
// and off-chain records it was derived from).

export interface Grounding {
  checked: number
  grounded: number
  ungrounded: string[]
}

/**
 * A numeric claim, stated explicitly, and named.
 *
 * Prose grounding (see `checkGrounding`) works on free text and is the right
 * tool for a model-written explanation. It is the wrong tool for a report
 * whose numbers are known to be structured: it cannot tell a material figure
 * from a threshold ("<$10k liquidity"), a count, or a rounding constant, and
 * it silently ignores single digits.
 *
 * For structured reports, the author states the figures it asserts AND the
 * metric each one is, and the checker recomputes every metric from the raw
 * records independently. The two computations are separate code paths, so
 * agreement is evidence rather than tautology.
 */
export interface Figure {
  /** The metric this figure asserts — the key the checker recomputes. */
  metric: string
  /** The asserted value. */
  value: number
}

export interface FigureGrounding {
  checked: number
  grounded: number
  /** Metrics whose asserted value did not match the recomputation. */
  ungrounded: string[]
}

const NUM = /(?<![\w.])-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|(?<![\w.])-?\d+(?:\.\d+)?/g

export interface ExtractedNumber {
  raw: string
  value: number
  /** The number was written as a percentage ("85%"). */
  percent: boolean
}

export function extractNumbers(text: string): ExtractedNumber[] {
  const out: ExtractedNumber[] = []
  for (const m of text.matchAll(NUM)) {
    const raw = m[0]
    const value = Number(raw.replace(/,/g, ""))
    if (Number.isFinite(value)) {
      // A "%" immediately after the number marks it as a percentage — the
      // only case where comparing across a factor of 100 is meaningful.
      const after = text[m.index! + raw.length]
      out.push({ raw, value, percent: after === "%" })
    }
  }
  return out
}

function close(a: number, b: number): boolean {
  if (a === b) return true
  const scale = Math.max(Math.abs(a), Math.abs(b))
  return scale > 0 && Math.abs(a - b) / scale <= 0.01
}

/**
 * Check explicitly-stated figures against independently recomputed values.
 *
 * `observed` is a map of metric name to the value the checker computed from
 * the raw records. A figure is grounded when the metric is present and the
 * two values agree within 1%. A figure naming a metric that was never
 * recomputed is NOT grounded — an unverifiable claim is an unverifiable
 * claim.
 */
export function checkFigures(figures: Figure[], observed: Record<string, number>): FigureGrounding {
  const ungrounded: string[] = []
  let grounded = 0
  for (const f of figures) {
    const o = observed[f.metric]
    if (o !== undefined && close(f.value, o)) grounded++
    else ungrounded.push(f.metric)
  }
  return { checked: figures.length, grounded, ungrounded }
}

/**
 * A claim is grounded if the same value appears in the evidence.
 *
 * Comparing across a factor of 100 (a percentage against its fraction) is
 * only allowed where the claim actually LOOKS like a percentage or a
 * fraction. Applying that rule to every number makes the check almost
 * meaningless: 9,999,999 × 100 lands within 0.01% of 1,000,000,000, so a
 * fabricated figure would be "grounded" by an unrelated value.
 */
export function checkGrounding(answer: string, evidence: string[], question: string): Grounding {
  const known = extractNumbers([...evidence, question].join("\n")).map((n) => n.value)
  const claims = extractNumbers(answer).filter(
    (n) => !(Number.isInteger(n.value) && Math.abs(n.value) < 10 && !n.raw.includes(".")),
  )
  const seen = new Set<string>()
  const ungrounded: string[] = []
  let grounded = 0
  let checked = 0
  for (const c of claims) {
    if (seen.has(c.raw)) continue
    seen.add(c.raw)
    checked++
    // A fraction (0 < v < 1) is a percentage that lost its sign.
    const looksScaled = c.percent || (c.value > 0 && c.value < 1)
    const ok = known.some(
      (k) => close(c.value, k) || (looksScaled && (close(c.value / 100, k) || close(c.value * 100, k))),
    )
    if (ok) grounded++
    else ungrounded.push(c.raw)
  }
  return { checked, grounded, ungrounded }
}

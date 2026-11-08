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

export interface Grounding {
  checked: number
  grounded: number
  ungrounded: string[]
}

const NUM = /(?<![\w.])-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|(?<![\w.])-?\d+(?:\.\d+)?/g

export function extractNumbers(text: string): { raw: string; value: number }[] {
  const out: { raw: string; value: number }[] = []
  for (const m of text.matchAll(NUM)) {
    const raw = m[0]
    const value = Number(raw.replace(/,/g, ""))
    if (Number.isFinite(value)) out.push({ raw, value })
  }
  return out
}

function close(a: number, b: number): boolean {
  if (a === b) return true
  const scale = Math.max(Math.abs(a), Math.abs(b))
  return scale > 0 && Math.abs(a - b) / scale <= 0.01
}

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
    const ok = known.some((k) => close(c.value, k) || close(c.value / 100, k) || close(c.value * 100, k))
    if (ok) grounded++
    else ungrounded.push(c.raw)
  }
  return { checked, grounded, ungrounded }
}

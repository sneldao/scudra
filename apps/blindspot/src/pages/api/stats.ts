// GET /api/stats — the operator's view.
//
// "How is the product actually used" is the question the project could not
// answer for a year. This answers it: cases run, cases returned to, what
// people said about our output, and what it cost.
//
// Counts only. No case contents, no identifiers, no addresses.
//
// OPERATOR-ONLY. This used to be open to anyone who asked, which exposed the
// waitlist size, the feedback breakdown and the running spend. It is behind
// an operator key, and — because "behind a key that might not be set" is
// how this goes wrong — it REFUSES to serve rather than serving openly when
// no key is configured. An operator endpoint that quietly opens is worse
// than one that is missing.

import type { APIRoute } from "astro"
import { getCaseStore, getOperatorStore } from "../../server/store-singleton.js"

export const GET: APIRoute = async ({ request }) => {
  const operatorKey = process.env.BLINDSPOT_OPERATOR_KEY
  if (!operatorKey) {
    return json({ error: "The operator endpoint is not configured on this server." }, 503)
  }

  const supplied = request.headers.get("x-operator-key")
  if (supplied !== operatorKey) return json({ error: "Unauthorized." }, 401)

  const store = getCaseStore()
  if (!store) return json({ available: false }, 503)

  return json({
    available: true,
    ...store.stats(),
    waitlistSize: getOperatorStore()?.waitlistSize() ?? 0,
    eventCounts: getOperatorStore()?.eventCounts() ?? {},
  })
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

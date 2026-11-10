// GET /api/stats — the operator's view.
//
// "How is the product actually used" is the question the project could not
// answer for a year. This answers it: cases run, cases returned to, what
// people said about our output, what it cost, and how many people are on
// the waitlist.
//
// Counts only. No addresses, no case contents, no identifiers.
//
// The one thing this endpoint exposes that a customer should not see is the
// waitlist size, so it is behind an operator key when one is configured.

import type { APIRoute } from "astro"
import { getStore } from "../../server/store-singleton.js"

export const GET: APIRoute = async ({ request }) => {
  const store = getStore()
  if (!store) return json({ available: false }, 503)

  const operatorKey = process.env.BLINDSPOT_OPERATOR_KEY
  if (operatorKey) {
    const supplied = request.headers.get("x-operator-key")
    if (supplied !== operatorKey) return json({ error: "Unauthorized." }, 401)
  }

  return json({ available: true, ...store.stats() })
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

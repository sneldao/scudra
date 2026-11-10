// GET /api/cases — the user's case list.
//
// The point of persistence is that a user can come back. This is that
// endpoint: the investigations, newest first, with the verdict and enough
// detail to know whether it is worth opening.
//
// OWNER-SCOPED. This used to return every case on the server to anyone who
// asked, which meant the product's core asset — what we know about a
// subject — was world-readable. The list is now filtered to the caller's
// owner key, so an id is not enough: a stranger who learns a case id still
// cannot read the case.
//
// GET /api/cases?limit=20

import type { APIRoute } from "astro"
import { getCaseStore } from "../../../server/store-singleton.js"
import { requestOwner } from "../../../server/request-owner.js"

export const GET: APIRoute = async ({ url, cookies }) => {
  const owner = requestOwner(cookies, url)
  const store = getCaseStore()
  if (!store) {
    return json({ cases: [], persisted: false }, 503)
  }
  const limitRaw = Number(url.searchParams.get("limit") ?? 20)
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 20

  const cases = store.list(limit, owner.hash).map((c) => ({
    id: c.id,
    ensName: c.ensName,
    address: c.address,
    createdAt: c.createdAt,
    riskScore: c.riskScore,
    riskLabel: c.riskLabel,
    summary: c.summary,
    signalCount: c.signals.length,
    costUsdCents: c.costUsdCents,
    durationMs: c.durationMs,
    feedback: c.feedback,
    rawExpiresAt: c.rawExpiresAt,
  }))

  return json({ cases, persisted: true })
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

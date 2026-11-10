// GET /api/cases — the user's case list.
//
// The point of persistence is that a user can come back. This is that
// endpoint: the investigations, newest first, with the verdict and enough
// detail to know whether it is worth opening.
//
// GET /api/cases?limit=20

import type { APIRoute } from "astro"
import { getStore } from "../../../server/store-singleton.js"

export const GET: APIRoute = async ({ url }) => {
  const store = getStore()
  if (!store) {
    return json({ cases: [], persisted: false }, 503)
  }
  const limitRaw = Number(url.searchParams.get("limit") ?? 20)
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 20

  const cases = store.list(limit).map((c) => ({
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

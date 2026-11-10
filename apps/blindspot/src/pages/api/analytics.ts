// POST /api/analytics — first-party, coarse, self-hosted usage events.
//
// WHY THIS EXISTS: we shipped four experiences, a manifesto and a taxonomy
// without knowing whether anyone used any of them. "Which page gets visited,
// which run completes, does anyone come back" is not a vanity metric — it is
// the difference between building on evidence and building on taste.
//
// WHAT THIS IS NOT: no identifiers, no cookies, no fingerprinting, no
// third party. An event is a name and an optional small bag of facts. The
// site's own pages beacon here too, so one place answers "what is used".
//
// CORS is open because this is a write-only public counter — the data is
// aggregate counts, and the abuse surface is a number going up.

import type { APIRoute } from "astro"
import { getOperatorStore } from "../../server/store-singleton.js"

const ALLOWED_NAMES = new Set([
  "page.view",
  "investigation.started",
  "investigation.completed",
  "investigation.failed",
  "case.opened",
  "feedback.given",
  "export.requested",
])

export const OPTIONS: APIRoute = async () => new Response(null, { status: 204, headers: corsHeaders() })

export const POST: APIRoute = async ({ request }) => {
  let body: { name?: unknown; meta?: unknown }
  try {
    body = await request.json()
  } catch {
    return json({ ok: false }, 400)
  }

  const name = typeof body.name === "string" ? body.name : ""
  if (!ALLOWED_NAMES.has(name)) return json({ ok: false }, 400)

  const meta =
    body.meta && typeof body.meta === "object" && !Array.isArray(body.meta)
      ? (body.meta as Record<string, unknown>)
      : null

  const store = getOperatorStore()
  try {
    store?.recordEvent(name, meta)
  } catch {
    // Losing an analytics write must never break the user's request.
  }
  return json({ ok: true })
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  })
}

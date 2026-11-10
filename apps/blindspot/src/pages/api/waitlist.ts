// POST /api/waitlist { email, source? } — the way to tell us you exist.
//
// This is the cheapest possible way to find a real user, and the first thing
// we should have done a year ago. A waitlist is not a marketing funnel —
// it is a list of people who asked for the thing, which is the only evidence
// of demand that does not require us to guess.
//
// The address is stored and nothing else. No tracking, no third party.
//
// GET /api/waitlist — how many people are on it. Counts only, no addresses.

import type { APIRoute } from "astro"
import { getOperatorStore } from "../../server/store-singleton.js"

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const OPTIONS: APIRoute = async () => new Response(null, { status: 204, headers: corsHeaders() })

export const GET: APIRoute = async () => {
  const store = getOperatorStore()
  if (!store) return json({ size: 0, available: false })
  return json({ size: store.waitlistSize(), available: true })
}

export const POST: APIRoute = async ({ request }) => {
  let body: { email?: unknown; source?: unknown }
  try {
    body = await request.json()
  } catch {
    return json({ ok: false, error: "Expected a JSON body." }, 400)
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 254) : ""
  if (!EMAIL.test(email)) return json({ ok: false, error: "That does not look like an email address." }, 400)

  const source = typeof body.source === "string" ? body.source.slice(0, 120) : null

  const store = getOperatorStore()
  if (!store) return json({ ok: false, error: "Storage is unavailable on this server." }, 503)

  try {
    const added = store.addToWaitlist(email, source)
    return json({ ok: true, already: !added })
  } catch {
    return json({ ok: false, error: "Could not save that. Try again in a moment." }, 500)
  }
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

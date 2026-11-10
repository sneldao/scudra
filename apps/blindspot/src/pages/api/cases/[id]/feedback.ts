// POST /api/cases/[id]/feedback — the user tells us whether we were right.
//
// This is the cheapest possible research loop and the only one that works.
//
// A self-check catches the model being wrong. It cannot catch the agent
// missing the workflow the user actually cares about — only the user knows
// that. If we never ask, we are guessing at what to build next, and guessing
// is what we did for a year.
//
// The body is { verdict: "wrong" | "incomplete" | "right", note?: string }.
// The note is optional but it is where the useful information is.

import type { APIRoute } from "astro"
import { getStore } from "../../../../server/store-singleton.js"

const VERDICTS = new Set(["wrong", "incomplete", "right"])

export const POST: APIRoute = async ({ params, request }) => {
  const store = getStore()
  if (!store) return json({ error: "Case storage is unavailable on this server." }, 503)
  const id = params.id
  if (!id) return json({ error: "Missing case id." }, 400)

  let body: { verdict?: unknown; note?: unknown }
  try {
    body = await request.json()
  } catch {
    return json({ error: "Expected a JSON body." }, 400)
  }

  const verdict = typeof body.verdict === "string" ? body.verdict : ""
  if (!VERDICTS.has(verdict)) {
    return json({ error: 'verdict must be one of "wrong", "incomplete", "right".' }, 400)
  }
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 2000) : null

  const ok = store.setFeedback(id, verdict as "wrong" | "incomplete" | "right", note)
  if (!ok) return json({ error: "No such case." }, 404)

  return json({ saved: true })
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

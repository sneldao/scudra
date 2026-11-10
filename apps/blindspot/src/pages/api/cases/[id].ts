// GET  /api/cases/[id] — one case, in full.
// DELETE /api/cases/[id] — the user deletes their own evidence.
//
// The delete matters as much as the get. An investigator who cannot remove
// what they gathered is carrying a liability, not a tool.

import type { APIRoute } from "astro"
import { getStore } from "../../../server/store-singleton.js"
export const GET: APIRoute = async ({ params }) => {
  const store = getStore()
  if (!store) return json({ error: "Case storage is unavailable on this server." }, 503)
  const id = params.id
  if (!id) return json({ error: "Missing case id." }, 400)

  const c = store.get(id)
  if (!c) return json({ error: "No such case." }, 404)

  return json({ case: c })
}

export const DELETE: APIRoute = async ({ params }) => {
  const store = getStore()
  if (!store) return json({ error: "Case storage is unavailable on this server." }, 503)
  const id = params.id
  if (!id) return json({ error: "Missing case id." }, 400)

  const deleted = store.delete(id)
  if (!deleted) return json({ error: "No such case." }, 404)
  return json({ deleted: true })
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

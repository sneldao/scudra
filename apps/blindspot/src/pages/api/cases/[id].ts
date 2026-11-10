// GET  /api/cases/[id] — one case, in full.
// DELETE /api/cases/[id] — the user deletes their own evidence.
//
// The delete matters as much as the get. An investigator who cannot remove
// what they gathered is carrying a liability, not a tool.
//
// OWNER-SCOPED. A case id is not authorisation: it is looked up together
// with the caller's owner fingerprint, so a stranger who learns an id still
// cannot read, export or delete it.

import type { APIRoute } from "astro"
import { getCaseStore } from "../../../server/store-singleton.js"
import { requestOwner } from "../../../server/request-owner.js"

export const GET: APIRoute = async ({ params, url, cookies }) => {
  const owner = requestOwner(cookies, url)
  const store = getCaseStore()
  if (!store) return json({ error: "Case storage is unavailable on this server." }, 503)
  const id = params.id
  if (!id) return json({ error: "Missing case id." }, 400)

  const c = store.getForOwner(id, owner.hash)
  // A case that exists but is not yours is reported as missing, not as
  // forbidden. "Forbidden" confirms the id is real, which is information a
  // stranger should not get for free.
  if (!c) return json({ error: "No such case." }, 404)

  return json({ case: c })
}

export const DELETE: APIRoute = async ({ params, url, cookies }) => {
  const owner = requestOwner(cookies, url)
  const store = getCaseStore()
  if (!store) return json({ error: "Case storage is unavailable on this server." }, 503)
  const id = params.id
  if (!id) return json({ error: "Missing case id." }, 400)

  const deleted = store.delete(id, owner.hash)
  if (!deleted) return json({ error: "No such case." }, 404)
  return json({ deleted: true })
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

// POST /api/run  { task, csv? } → SSE stream of AnalystEvents.
import type { APIRoute } from "astro"
import { buildDeps, getGate } from "../../lib/deps.js"
import { clientKey, rateLimited } from "../../lib/limiter.js"
import { runTask } from "../../lib/orchestrator.js"
import { sseResponse } from "../../lib/sse.js"

export const POST: APIRoute = async ({ request, clientAddress }) => {
  let body: { task?: unknown; csv?: unknown }
  try {
    body = await request.json()
  } catch {
    return json({ error: "Invalid JSON." }, 400)
  }
  if (typeof body.task !== "string") return json({ error: "Missing task." }, 400)
  const csv = typeof body.csv === "string" ? body.csv : undefined
  const built = buildDeps()
  if ("problem" in built) return json({ error: built.problem }, 500)

  if (rateLimited(`run:${clientKey(request, clientAddress, built.config.trustProxy)}`)) {
    return json({ error: "Too many runs from your address. Give it a minute." }, 429)
  }
  const release = getGate(built.config.maxConcurrent).tryAcquire()
  if (!release)
    return json({ error: "All sandboxes are busy right now. Try again in a few seconds.", code: "busy" }, 503)

  return sseResponse(request, async (send, signal) => {
    try {
      await runTask(built.deps, { task: body.task as string, csv }, send, signal)
    } finally {
      release()
    }
  })
}

function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } })
}

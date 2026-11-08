// GET /api/probe → SSE stream: hostile code vs. a real sandbox. No LLM needed.
import type { APIRoute } from "astro"
import { buildProbeDeps, getGate } from "../../lib/deps.js"
import { clientKey, rateLimited } from "../../lib/limiter.js"
import { runContainmentProbe } from "../../lib/orchestrator.js"
import { sseResponse } from "../../lib/sse.js"

export const GET: APIRoute = ({ request, clientAddress }) => {
  const { deps, config } = buildProbeDeps()
  if (rateLimited(`probe:${clientKey(request, clientAddress, config.trustProxy)}`, 4)) {
    return json({ error: "Too many probes from your address. Give it a minute." }, 429)
  }
  const release = getGate(config.maxConcurrent).tryAcquire()
  if (!release)
    return json({ error: "All sandboxes are busy right now. Try again in a few seconds.", code: "busy" }, 503)
  return sseResponse(request, async (send) => {
    try {
      await runContainmentProbe(deps, send)
    } finally {
      release()
    }
  })
}

function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } })
}

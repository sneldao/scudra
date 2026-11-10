// SSE endpoint — streams investigation events to the browser.
// GET /api/investigate?name=vitalik.eth
//
// Guards, in order: name must be structurally valid, config must exist, and
// the caller must be under the rate limit. Everything fails fast BEFORE the
// orchestrator spawns paid infrastructure.

import type { APIRoute } from "astro"
import { investigate, MissingConfigError } from "../../lib/orchestrator.js"
import { isValidEnsName } from "../../lib/ens.js"
import { checkRateLimit, releaseSlot } from "../../server/rate-limit.js"
import { getStore } from "../../server/store-singleton.js"
import { estimateInvestigationCostUsdCents } from "../../lib/cost.js"
import type { InvestigationEvent } from "../../lib/events.js"

export const GET: APIRoute = async ({ url, clientAddress }) => {
  const ensName = url.searchParams.get("name")
  if (!ensName || !isValidEnsName(ensName)) {
    return jsonResponse({ error: "Provide a valid ENS name, e.g. vitalik.eth" }, 400)
  }

  // Name the missing key rather than saying "not configured". An operator
  // reading this needs to know WHICH key to add, and "the investigation API
  // key" could mean either of two different ones.
  const missingKeys = [
    !process.env.SOLARI_API_KEY ? "SOLARI_API_KEY" : null,
    !process.env.MOBULA_API_KEY ? "MOBULA_API_KEY" : null,
  ].filter((k): k is string => k !== null)
  if (missingKeys.length > 0) {
    return eventStream((send) => {
      send({
        type: "error",
        message: `This server is missing ${missingKeys.join(" and ")} — the operator needs to configure ${
          missingKeys.length === 1 ? "it" : "them"
        } before investigations can run.`,
      })
    })
  }

  const decision = checkRateLimit(clientAddress ?? "unknown")
  if (!decision.allowed) {
    return eventStream((send) => {
      send({
        type: "error",
        message:
          decision.reason === "rate"
            ? "Too many investigations from this address — try again in a few minutes."
            : "The investigation service is already running at capacity — try again in a moment.",
      })
    })
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      const sendEvent = (event: InvestigationEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }

      try {
        await investigate(ensName, {
          outputDir: "reports",
          onEvent: sendEvent,
          store: getStore(),
          costUsdCents: estimateInvestigationCostUsdCents(),
        })
      } catch (err) {
        sendEvent({ type: "error", message: userMessage(err) })
      } finally {
        releaseSlot()
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}

// An SSE response carrying a single terminal error event. Keeping rejections
// on the event stream lets the client display them through its normal error
// path (a bare non-200 would only trip EventSource's opaque onerror).
function eventStream(write: (send: (event: InvestigationEvent) => void) => void): Response {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      write((event) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      })
      controller.close()
    },
  })
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

// The browser is a system boundary: internal exception text (missing keys,
// DNS failures, stack details) must not reach it verbatim.
function userMessage(err: unknown): string {
  if (err instanceof MissingConfigError) {
    return `This server is missing ${err.missing.join(" and ")} — the operator needs to configure ${
      err.missing.length === 1 ? "it" : "them"
    } before investigations can run.`
  }
  const message = err instanceof Error ? err.message : String(err)
  if (/api\s?key/i.test(message)) {
    return "An upstream provider rejected our credentials — the operator needs to check the configured keys."
  }
  if (/Invalid ENS name/.test(message)) {
    return "That ENS name could not be resolved. Check the spelling and try again."
  }
  if (/No address found for ENS name/.test(message)) {
    return "That ENS name does not resolve to an address."
  }
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(message)) {
    return "An upstream data provider could not be reached. Try again in a moment."
  }
  return "The investigation could not be completed. Please try again."
}

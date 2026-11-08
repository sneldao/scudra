import type { AnalystEvent } from "./events.js"

/** Wrap an event-producing job as an SSE Response. Errors are sanitized. */
export function sseResponse(
  request: Request,
  job: (send: (e: AnalystEvent) => void, signal: AbortSignal) => Promise<void>,
): Response {
  const abort = new AbortController()
  request.signal.addEventListener("abort", () => abort.abort())
  const encoder = new TextEncoder()
  const body = new ReadableStream({
    async start(controller) {
      const send = (e: AnalystEvent) => {
        if (!abort.signal.aborted) controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`))
      }
      try {
        await job(send, abort.signal)
      } catch (err) {
        console.error("[analyst] stream failed:", err)
        send({ type: "error", message: "Something went wrong. Try again." })
      } finally {
        if (!abort.signal.aborted) controller.close()
      }
    },
    cancel() {
      abort.abort()
    },
  })
  return new Response(body, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" },
  })
}

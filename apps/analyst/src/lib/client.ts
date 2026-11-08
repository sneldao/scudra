import type { AnalystEvent } from "./events.js"

/** POST/GET an SSE endpoint and feed parsed events to `on`. Non-2xx → one error event. */
export async function streamEvents(url: string, init: RequestInit, on: (e: AnalystEvent) => void, signal: AbortSignal) {
  const res = await fetch(url, { ...init, signal })
  if (!res.ok || !res.body) {
    const j = (await res.json().catch(() => ({}))) as { error?: string; code?: "busy" }
    on({ type: "error", message: j.error ?? "The request failed.", code: j.code ?? "internal" })
    return
  }
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ""
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const parts = buf.split("\n\n")
    buf = parts.pop() ?? ""
    for (const p of parts) {
      if (!p.startsWith("data: ")) continue
      try {
        on(JSON.parse(p.slice(6)) as AnalystEvent)
      } catch {
        /* ignore a malformed frame */
      }
    }
  }
}

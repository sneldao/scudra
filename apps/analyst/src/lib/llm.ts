// Vultr Serverless Inference client (OpenAI-compatible chat completions).
// The API key stays on the control plane; the sandbox never sees it.
//
// Resilient by design: bounded retries with backoff on 429/5xx/network errors
// (honouring Retry-After), no retry on 4xx that mean "your request is wrong",
// per-request timeout, caller cancellation, and errors that never echo the key.

export interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}

export type Llm = (messages: ChatMessage[], signal?: AbortSignal) => Promise<string>

export class InferenceError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryable = false,
  ) {
    super(message)
  }
}

export interface LlmOptions {
  baseUrl: string
  apiKey: string
  model: string
  maxRetries?: number
  timeoutMs?: number
  /** Injectable for tests. */
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
}

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener("abort", () => (clearTimeout(t), reject(new DOMException("aborted", "AbortError"))), {
      once: true,
    })
  })

export function retryDelay(attempt: number, retryAfter: string | null): number {
  const ra = retryAfter ? Number(retryAfter) : NaN
  if (Number.isFinite(ra) && ra >= 0) return Math.min(ra * 1000, 8000)
  return Math.min(500 * 2 ** attempt, 4000)
}

/** Pull the text out of an OpenAI-style response, tolerating content-parts arrays. */
export function extractContent(json: unknown): string | null {
  const msg = (json as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content
  if (typeof msg === "string") return msg.trim() || null
  if (Array.isArray(msg)) {
    const t = msg
      .map((p) => (typeof p === "string" ? p : ((p as { text?: string })?.text ?? "")))
      .join("")
      .trim()
    return t || null
  }
  return null
}

export function vultrLlm(opts: LlmOptions): Llm {
  const doFetch = opts.fetchImpl ?? fetch
  const maxRetries = opts.maxRetries ?? 2
  const sleep = opts.sleep
  return async (messages, signal) => {
    let lastErr: InferenceError | undefined
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (signal?.aborted) throw new DOMException("aborted", "AbortError")
      const timeout = AbortSignal.timeout(opts.timeoutMs ?? 60_000)
      try {
        const res = await doFetch(`${opts.baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${opts.apiKey}` },
          body: JSON.stringify({ model: opts.model, messages, temperature: 0.2, max_tokens: 4096 }),
          signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        })
        if (res.ok) {
          const text = extractContent(await res.json().catch(() => null))
          if (!text) throw new InferenceError("inference returned no content", res.status, true)
          return text
        }
        const body = (await res.text().catch(() => "")).slice(0, 160).replace(/\s+/g, " ")
        const retryable = res.status === 429 || res.status >= 500
        lastErr = new InferenceError(`inference ${res.status}${body ? `: ${body}` : ""}`, res.status, retryable)
        if (!retryable) throw lastErr
        if (attempt < maxRetries)
          await (sleep ?? ((ms) => wait(ms, signal)))(retryDelay(attempt, res.headers.get("retry-after")))
      } catch (err) {
        if (signal?.aborted) throw new DOMException("aborted", "AbortError")
        if (err instanceof InferenceError && !err.retryable) throw err
        lastErr =
          err instanceof InferenceError
            ? err
            : new InferenceError(`inference unreachable: ${(err as Error).name}`, undefined, true)
        if (attempt < maxRetries) await (sleep ?? ((ms) => wait(ms, signal)))(retryDelay(attempt, null))
      }
    }
    throw lastErr ?? new InferenceError("inference failed")
  }
}

/** Human sentence for the UI. Never includes upstream bodies or secrets. */
export function describeInferenceError(err: unknown): string {
  if (err instanceof InferenceError) {
    if (err.status === 401 || err.status === 403)
      return "The model service rejected our credentials. The operator needs to check the Vultr inference key."
    if (err.status === 404) return "The configured model was not found on Vultr Serverless Inference."
    if (err.status === 429) return "The model service is rate-limiting us. Try again in a few seconds."
    return "The model service is unavailable right now. Try again shortly."
  }
  return "The analyst lost its tools. Try again."
}

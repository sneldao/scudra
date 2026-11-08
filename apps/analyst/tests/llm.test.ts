import { describe, expect, it } from "vitest"
import { describeInferenceError, extractContent, InferenceError, retryDelay, vultrLlm } from "../src/lib/llm.js"

const ok = (content: unknown) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })
const status = (n: number, headers: Record<string, string> = {}) =>
  new Response("upstream says no", { status: n, headers })
const mk = (responses: (Response | Error)[], extra = {}) => {
  const calls: { url: string; body: Record<string, unknown>; auth: string | null }[] = []
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(init.body as string), auth: new Headers(init.headers).get("authorization") })
    const r = responses.shift()!
    if (r instanceof Error) throw r
    return r
  }) as unknown as typeof fetch
  const llm = vultrLlm({
    baseUrl: "https://x/v1",
    apiKey: "sk-secret",
    model: "m",
    fetchImpl,
    sleep: async () => {},
    ...extra,
  })
  return { llm, calls }
}
const msgs = [{ role: "user" as const, content: "hi" }]

describe("vultr inference client", () => {
  it("calls the OpenAI-compatible endpoint with bearer auth", async () => {
    const { llm, calls } = mk([ok("hello")])
    expect(await llm(msgs)).toBe("hello")
    expect(calls[0]).toMatchObject({ url: "https://x/v1/chat/completions", auth: "Bearer sk-secret" })
    expect(calls[0]!.body).toMatchObject({ model: "m", messages: msgs })
  })
  it("retries 429 then succeeds", async () => {
    const { llm, calls } = mk([status(429), ok("fine")])
    expect(await llm(msgs)).toBe("fine")
    expect(calls).toHaveLength(2)
  })
  it("retries 5xx and network errors, then gives up after maxRetries", async () => {
    const { llm, calls } = mk([status(503), new TypeError("fetch failed"), status(502)])
    await expect(llm(msgs)).rejects.toBeInstanceOf(InferenceError)
    expect(calls).toHaveLength(3)
  })
  it("does not retry a 401/404 (retrying cannot help)", async () => {
    const { llm, calls } = mk([status(401), ok("never")])
    await expect(llm(msgs)).rejects.toMatchObject({ status: 401, retryable: false })
    expect(calls).toHaveLength(1)
  })
  it("treats empty content as retryable", async () => {
    const { llm } = mk([ok(""), ok("second time")])
    expect(await llm(msgs)).toBe("second time")
  })
  it("accepts content-parts arrays", () => {
    expect(extractContent({ choices: [{ message: { content: [{ type: "text", text: "a" }, { text: "b" }] } }] })).toBe(
      "ab",
    )
    expect(extractContent(null)).toBeNull()
    expect(extractContent({})).toBeNull()
  })
  it("stops immediately when the caller aborts", async () => {
    const ac = new AbortController()
    ac.abort()
    const { llm, calls } = mk([ok("x")])
    await expect(llm(msgs, ac.signal)).rejects.toMatchObject({ name: "AbortError" })
    expect(calls).toHaveLength(0)
  })
  it("backoff honours Retry-After and is bounded", () => {
    expect(retryDelay(0, "2")).toBe(2000)
    expect(retryDelay(0, "9999")).toBe(8000)
    expect(retryDelay(0, null)).toBe(500)
    expect(retryDelay(10, null)).toBe(4000)
  })
  it("user-facing messages never contain upstream text or keys", () => {
    for (const s of [401, 404, 429, 500]) {
      const m = describeInferenceError(new InferenceError("inference: sk-secret upstream says no", s))
      expect(m).not.toMatch(/sk-secret|upstream/)
    }
    expect(describeInferenceError(new InferenceError("x", 401))).toMatch(/credentials/)
    expect(describeInferenceError(new Error("x"))).toMatch(/lost its tools/)
  })
})

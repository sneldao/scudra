// Admission control. A sandbox costs real CPU and RAM on one VM; cap how many
// run at once and shed load with a clear message instead of thrashing.

export interface Gate {
  /** Returns a release function, or null if the host is full. */
  tryAcquire(): (() => void) | null
  readonly active: number
}

export function createGate(max: number): Gate {
  let active = 0
  return {
    get active() {
      return active
    },
    tryAcquire() {
      if (active >= max) return null
      active++
      let released = false
      return () => {
        if (!released) {
          released = true
          active--
        }
      }
    },
  }
}

const hits = new Map<string, number[]>()
export function rateLimited(key: string, max = 8, windowMs = 60_000): boolean {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
  recent.push(now)
  hits.set(key, recent)
  return recent.length > max
}

/** Behind Caddy/nginx every request comes from 127.0.0.1; trust X-Forwarded-For only when told to. */
export function clientKey(request: Request, clientAddress: string | undefined, trustProxy: boolean): string {
  if (trustProxy) {
    const first = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    if (first) return first
  }
  return clientAddress ?? "unknown"
}

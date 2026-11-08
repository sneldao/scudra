// Run receipts — "verifiable output", literally.
//
// A receipt binds a run's facts (what code ran, what came out, which limits
// applied, whether destruction was verified) with an HMAC held only on the
// control plane. Editing any field invalidates it. This proves the record is
// ours and unmodified; it does not prove the facts to a third party (that
// would need asymmetric signing or attestation — see README "Honest limits").

import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import type { SandboxLimits } from "./events.js"
import type { Verdict } from "./verify.js"

export interface Receipt {
  version: 1
  runId: string
  provider: string
  image: string
  model: string
  sandboxId: string
  limits: SandboxLimits
  startedAt: string
  sandboxBornAt: string
  sandboxDestroyedAt: string
  destroyVerified: boolean
  attempts: number
  outcome: "ok" | "failed" | "error"
  verification: Verdict | null
  exitCode: number | null
  codeSha256: string | null
  stdoutSha256: string | null
  datasetSha256: string | null
  artifacts: { name: string; sha256: string; bytes: number }[]
  signature: string
}

export const sha256 = (s: string | Buffer) => createHash("sha256").update(s).digest("hex")

/** Deterministic JSON: sorted keys, so the signature is order-independent. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(",")}}`
  }
  return JSON.stringify(v)
}

const mac = (r: Omit<Receipt, "signature">, secret: string) =>
  createHmac("sha256", secret).update(canonical(r)).digest("hex")

export function signReceipt(r: Omit<Receipt, "signature">, secret: string): Receipt {
  return { ...r, signature: mac(r, secret) }
}

export function verifyReceipt(r: Receipt, secret: string): boolean {
  if (!r || typeof r !== "object" || typeof r.signature !== "string") return false
  const { signature, ...rest } = r
  const expected = Buffer.from(mac(rest, secret))
  const given = Buffer.from(signature)
  return expected.length === given.length && timingSafeEqual(expected, given)
}

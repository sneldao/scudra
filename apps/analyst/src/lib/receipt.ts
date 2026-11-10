// Run receipts — "verifiable output", literally.
//
// A receipt binds a run's facts (what code ran, what came out, which limits
// applied, whether destruction was verified) with a signature.
//
// The signature is Ed25519 rather than an HMAC, and that is a deliberate
// change: an HMAC proves "we produced this and nobody edited it", which is
// worthless to someone who does not hold our key. An asymmetric signature
// proves the same thing to ANYONE, using a public key we can publish. The
// Analyst's receipts are now verifiable by a third party.
//
// The canonical encoding and the hashing primitives live in @scudra/evidence,
// shared with Blindspot — so a receipt from either experience is checked by
// exactly the same code.

import { canonical, canonicalHash, sha256, signDocument, verifyDocument } from "@scudra/evidence"
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
  /** Short id of the key that signed this receipt. */
  keyId: string
  signature: string
}

export { canonical, sha256 }

/** The part of a receipt that is actually signed — everything but the signature. */
export type ReceiptBody = Omit<Receipt, "signature">

/**
 * Sign a receipt body.
 *
 * The body MUST already contain `keyId`: the key id is part of what is
 * signed, so a receipt cannot be re-labelled as having been signed by a
 * different key. The signature covers exactly the body that is stored — the
 * same bytes the verifier recomputes.
 */
export function signReceipt(body: ReceiptBody, privateKeyPem: string): Receipt {
  return { ...body, signature: signDocument(body, privateKeyPem) }
}

/**
 * Verify a receipt using only the public key.
 *
 * Returns false — never throws — for malformed input. A verifier that can be
 * crashed by a bad receipt is not a verifier.
 */
export function verifyReceipt(r: Receipt, publicKeyPem: string): boolean {
  if (!r || typeof r !== "object" || typeof r.signature !== "string") return false
  const { signature, ...rest } = r
  return verifyDocument(rest, signature, publicKeyPem)
}

/** The stable identity of a receipt's content, independent of its signature. */
export const receiptContentHash = canonicalHash

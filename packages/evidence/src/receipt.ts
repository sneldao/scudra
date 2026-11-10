// A signed record of what was done.
//
// The receipt is the durable half of an investigation: the sandbox and the
// browser are gone, the investigator's trail is gone, and this document is
// what remains. It binds *what was claimed* to *what was actually observed*.
//
// Three independent properties, and it matters that they are independent:
//
//   1. CONTENT      — the facts are hashed, so any edit is detectable.
//   2. ORIGIN       — the signature is asymmetric, so a third party can check
//                     it against a published public key without trusting us.
//   3. GROUNDING    — the claims in the receipt are checked against the
//                     observations they claim to come from, in code.
//
// A signature alone proves nothing was edited *after* signing. It does not
// prove the contents were true when signed. Grounding is what closes that gap.

import { canonicalHash } from "./canonical.js"
import { signDocument, verifyDocument } from "./signing.js"
import type { Grounding } from "./grounding.js"

export interface Receipt {
  version: 1
  /** Stable id — the run, case, or investigation this receipt covers. */
  id: string
  /** What kind of thing this is. */
  kind: string
  /**
   * Who this document is for.
   *
   * "publishable" — safe to hand to someone who is not the user, because it
   * is independently checkable. A receipt qualifies: it is signed, and
   * anyone with the published public key can verify it without trusting us.
   *
   * "private" — the user's working file. Not to be published.
   *
   * This is a first-class field rather than a convention, because the
   * material a receipt is derived from is private and the receipt is not.
   * Mixing those two up is how a finding about a subject ends up published
   * by accident.
   */
  audience: "publishable" | "private"
  /** ISO timestamp of when the underlying work completed. */
  createdAt: string
  /** The public key that signed this receipt, and its short id. */
  signedBy: { keyId: string; publicKeyPem: string }
  /** sha256 of the canonical encoding of `claims` + `observations`. */
  contentHash: string
  /** What was asserted. */
  claims: unknown
  /** What was actually seen. */
  observations: unknown
  /** Which observations ground which claims. */
  grounding: Grounding
  /** base64 Ed25519 signature over the canonical encoding of the body. */
  signature: string
}

/** The part of a receipt that is actually signed — everything but the signature. */
export interface ReceiptBody {
  version: 1
  id: string
  kind: string
  audience: "publishable" | "private"
  createdAt: string
  signedBy: { keyId: string; publicKeyPem: string }
  contentHash: string
  claims: unknown
  observations: unknown
  grounding: Grounding
}

export function receiptBody(r: Receipt): ReceiptBody {
  const body: ReceiptBody = {
    version: r.version,
    id: r.id,
    kind: r.kind,
    audience: r.audience,
    createdAt: r.createdAt,
    signedBy: r.signedBy,
    contentHash: r.contentHash,
    claims: r.claims,
    observations: r.observations,
    grounding: r.grounding,
  }
  return body
}

export interface SignReceiptInput {
  id: string
  kind: string
  /** Defaults to "publishable" — a receipt is meant to be checkable. */
  audience?: "publishable" | "private"
  createdAt?: string
  claims: unknown
  observations: unknown
  grounding: Grounding
  privateKeyPem: string
  publicKeyPem: string
  keyId: string
}

/**
 * Build and sign a receipt. The content hash covers the claims and
 * observations together, so a swap of one for the other invalidates it.
 */
export function signReceipt(input: SignReceiptInput): Receipt {
  const body: Omit<ReceiptBody, "contentHash"> = {
    version: 1,
    id: input.id,
    kind: input.kind,
    audience: input.audience ?? "publishable",
    createdAt: input.createdAt ?? new Date().toISOString(),
    signedBy: { keyId: input.keyId, publicKeyPem: input.publicKeyPem },
    claims: input.claims,
    observations: input.observations,
    grounding: input.grounding,
  }
  const contentHash = canonicalHash({ claims: body.claims, observations: body.observations })
  const signed: ReceiptBody = { ...body, contentHash }
  return { ...signed, signature: signDocument(signed, input.privateKeyPem) }
}

/**
 * Verify a receipt using only the public key embedded in it.
 *
 * Checks, in order: the signature covers the body; the body is internally
 * consistent (its content hash still matches its claims and observations); and
 * no claim was left ungrounded.
 *
 * `strict` additionally fails the receipt when any claim is ungrounded — the
 * setting for a receipt a third party is being asked to rely on.
 */
export function verifyReceipt(
  receipt: Receipt,
  options: { strict?: boolean } = {},
): {
  signatureValid: boolean
  contentIntact: boolean
  grounded: boolean
  valid: boolean
} {
  // A verifier that can be crashed by a malformed receipt is not a verifier.
  if (!receipt || typeof receipt !== "object" || typeof receipt.signature !== "string") {
    return { signatureValid: false, contentIntact: false, grounded: false, valid: false }
  }
  const body = receiptBody(receipt)
  const signatureValid = verifyDocument(body, receipt.signature, body.signedBy.publicKeyPem)
  let contentIntact = false
  try {
    contentIntact = canonicalHash({ claims: body.claims, observations: body.observations }) === body.contentHash
  } catch {
    contentIntact = false
  }
  const grounded = body.grounding.ungrounded.length === 0
  const valid = signatureValid && contentIntact && (options.strict ? grounded : true)
  return { signatureValid, contentIntact, grounded, valid }
}

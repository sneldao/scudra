// Owner keys — who is allowed to read a case.
//
// Blindspot's whole promise is that the investigator's findings are protected
// while the infrastructure leaves no trace. The findings were NOT protected:
// every case was listable and readable by anyone who asked, with no
// credentials at all.
//
// The fix is a per-browser owner key.
//
//   • It is issued on first use and stored in an httpOnly cookie, so a
//     cross-site script cannot read it and a plain <a href> to the export
//     still works (no Authorization header plumbing).
//   • Only its hash is stored, so a leaked database does not hand over the
//     cases. The cookie is the credential; the database holds a fingerprint.
//   • It scopes the LIST as well as the reads. That was the actual hole: a
//     per-case check alone would have left every case enumerable.
//
// What this is NOT: accounts. There is no login, no password, no email
// recovery, and no cross-device access. Clearing your cookies loses access to
// your cases — which is why the export exists and why it is the thing to
// keep. Real accounts and scoped team keys are Phase 2.
//
// The receipt is a different story and stays public: it is signed, it is
// meant to be handed to someone, and anyone with the published public key can
// check it. The CASE is the user's working file and is private by default.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

export const OWNER_COOKIE = "scudra_owner"

/** How long an owner key lives. Long enough to be useful, not forever. */
export const OWNER_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // a year

export interface Owner {
  /** The raw key. Lives in the cookie and nowhere else. */
  key: string
  /** The fingerprint stored alongside each case. */
  hash: string
  /** True when this request had no key and one was just issued. */
  isNew: boolean
}

/** A fresh, unguessable owner key. */
export function generateOwnerKey(): string {
  return randomBytes(32).toString("base64url")
}

/** The fingerprint stored at rest. */
export function hashOwnerKey(key: string): string {
  return createHash("sha256").update(key).digest("hex")
}

/**
 * Constant-time comparison of two fingerprints.
 *
 * Both are hex digests of the same length, so timingSafeEqual applies. The
 * comparison is on the HASH, not the key, because that is what is stored.
 */
export function ownerHashesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

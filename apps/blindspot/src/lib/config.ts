// Runtime configuration for Blindspot.
//
// Two things here matter more than the rest:
//
//   SIGNING KEYS — the receipt's public key must be PUBLISHED, not just
//   held. A receipt a third party cannot check is a receipt that only we can
//   vouch for, which is the thing we are trying to get away from.
//
//   STORE PATH + RETENTION — where the user's evidence lives, and how long
//   the subject's raw material survives. The default is deliberately short:
//   raw material about a target is the sensitive part, and holding it longer
//   than the investigation needs is the risk we are managing.

import { generateKeyPair, keyId, publicKeyFromPrivate } from "@scudra/evidence"

export interface BlindspotConfig {
  signingKeyId: string
  privateKeyPem: string
  publicKeyPem: string
  storePath: string
  rawTtlHours: number
}

function env(name: string): string | undefined {
  const fromProcess = process.env[name]
  if (fromProcess) return fromProcess
  const meta = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
  return meta?.[name] || undefined
}

export function loadConfig(): BlindspotConfig {
  const { privateKeyPem, publicKeyPem } = loadSigningKeys()
  return {
    signingKeyId: keyId(publicKeyPem),
    privateKeyPem,
    publicKeyPem,
    storePath: env("BLINDSPOT_STORE_PATH") ?? "data/blindspot.db",
    rawTtlHours: Number(env("BLINDSPOT_RAW_TTL_HOURS") ?? 24) || 24,
  }
}

/**
 * The receipt signing keys.
 *
 * A PEM in an environment variable arrives with literal "\n" sequences, not
 * newlines, so they are expanded here — without that, createPublicKey fails
 * with an opaque decoder error.
 *
 * The public key is DERIVED from the private one when it is not configured
 * separately, so a deployment only has to set one key and the two can never
 * drift apart and invalidate every receipt.
 */
function loadSigningKeys(): { privateKeyPem: string; publicKeyPem: string } {
  const rawPrivate = (env("BLINDSPOT_SIGNING_KEY") ?? "").replace(/\\n/g, "\n")
  const rawPublic = (env("BLINDSPOT_PUBLIC_KEY") ?? "").replace(/\\n/g, "\n")

  if (rawPrivate) {
    return {
      privateKeyPem: rawPrivate,
      publicKeyPem: rawPublic || publicKeyFromPrivate(rawPrivate),
    }
  }

  // No configured key: generate an ephemeral one so the app still runs and
  // the demo still works. Receipts signed with it cannot be verified by a
  // third party — which the UI states plainly rather than implying otherwise.
  const generated = generateKeyPair()
  return { privateKeyPem: generated.privateKeyPem, publicKeyPem: generated.publicKeyPem }
}

/** True when the signing key is configured and publishable. */
export function isPublishable(): boolean {
  return Boolean(env("BLINDSPOT_SIGNING_KEY") && env("BLINDSPOT_PUBLIC_KEY"))
}

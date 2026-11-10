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

import { generateKeyPair, keyId } from "@scudra/evidence"

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
  const privateKeyPem = env("BLINDSPOT_SIGNING_KEY") ?? ""
  const publicKeyPem = env("BLINDSPOT_PUBLIC_KEY") ?? ""
  if (privateKeyPem && publicKeyPem) {
    return {
      signingKeyId: keyId(publicKeyPem),
      privateKeyPem,
      publicKeyPem,
      storePath: env("BLINDSPOT_STORE_PATH") ?? "data/blindspot.db",
      rawTtlHours: Number(env("BLINDSPOT_RAW_TTL_HOURS") ?? 24) || 24,
    }
  }
  // No configured key: generate an ephemeral one so the app still runs and
  // the demo still works. Receipts signed with it cannot be verified by a
  // third party — which the UI states plainly rather than implying otherwise.
  const generated = generateKeyPair()
  return {
    signingKeyId: keyId(generated.publicKeyPem),
    privateKeyPem: generated.privateKeyPem,
    publicKeyPem: generated.publicKeyPem,
    storePath: env("BLINDSPOT_STORE_PATH") ?? "data/blindspot.db",
    rawTtlHours: Number(env("BLINDSPOT_RAW_TTL_HOURS") ?? 24) || 24,
  }
}

/** True when the signing key is configured and publishable. */
export function isPublishable(): boolean {
  return Boolean(env("BLINDSPOT_SIGNING_KEY") && env("BLINDSPOT_PUBLIC_KEY"))
}

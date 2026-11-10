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
import { readFileSync } from "node:fs"

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
 * A KEY FILE is the preferred way to supply the key, and it is not a
 * preference: a PEM is multi-line, and systemd's EnvironmentFile parser
 * consumes the backslash in a "\n" escape, leaving a bare "n" and an
 * unparseable key. That failure surfaces as an opaque decoder error inside a
 * crypto library, several layers from the cause. A file cannot be mangled
 * this way.
 *
 * The public key is DERIVED from the private one when it is not configured
 * separately, so a deployment only has to set one key and the two can never
 * drift apart and invalidate every receipt.
 */
function loadSigningKeys(): { privateKeyPem: string; publicKeyPem: string } {
  // 1. A key file — the only form that survives systemd.
  const keyFile = env("BLINDSPOT_SIGNING_KEY_FILE")
  if (keyFile) {
    const privateKeyPem = readKeyFile(keyFile)
    const publicFile = env("BLINDSPOT_PUBLIC_KEY_FILE")
    return {
      privateKeyPem,
      publicKeyPem: publicFile ? readKeyFile(publicFile) : publicKeyFromPrivate(privateKeyPem),
    }
  }

  // 2. An environment variable, for local development where nothing
  //    reinterprets the value between the file and the process.
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

/** Read a PEM from disk. A missing or unreadable file is fatal, not silent. */
function readKeyFile(path: string): string {
  try {
    const pem = readFileSync(path, "utf-8").trim()
    if (!pem) throw new Error("file is empty")
    return pem
  } catch (err) {
    throw new Error(`could not read the receipt key file ${path}: ${(err as Error).message}`)
  }
}

/** True when the signing key is configured and publishable. */
export function isPublishable(): boolean {
  return Boolean(env("BLINDSPOT_SIGNING_KEY") && env("BLINDSPOT_PUBLIC_KEY"))
}

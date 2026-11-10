// Runtime configuration. Secrets live HERE, on the control plane, and are
// never passed into a sandbox.

import { DEFAULT_SPEC, type SandboxSpec } from "./providers/types.js"
import { generateKeyPair, keyId, publicKeyFromPrivate } from "@scudra/evidence"
import { readFileSync } from "node:fs"

export interface Config {
  inferenceBaseUrl: string
  inferenceKey: string
  inferenceModel: string
  /** Optional second model for the verifier pass (a different family is ideal). */
  inferenceVerifyModel: string
  provider: string
  spec: SandboxSpec
  /** The private key that signs run receipts. */
  receiptPrivateKey: string
  /** The public key a third party verifies receipts with. */
  receiptPublicKey: string
  /** Short id of that key, shown next to every signature. */
  receiptKeyId: string
  maxConcurrent: number
  trustProxy: boolean
}

let envLoaded = false
/** Load apps/analyst/.env if present (CLI + production). Real env vars always win. */
function loadDotEnv() {
  if (envLoaded) return
  envLoaded = true
  try {
    ;(process as unknown as { loadEnvFile?: (p?: string) => void }).loadEnvFile?.(".env")
  } catch {
    /* no .env — fine */
  }
}

function env(name: string): string | undefined {
  const fromProcess = process.env[name]
  if (fromProcess) return fromProcess
  // `import.meta.env` is populated from .env by Astro/Vite in dev.
  const meta = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
  return meta?.[name] || undefined
}

export function loadConfig(): Config {
  loadDotEnv()
  const { privateKey, publicKey, id } = loadSigningKeys()
  return {
    inferenceBaseUrl: (env("VULTR_INFERENCE_BASE_URL") ?? "https://api.vultrinference.com/v1").replace(/\/$/, ""),
    inferenceKey: env("VULTR_INFERENCE_API_KEY") ?? "",
    inferenceModel: env("VULTR_INFERENCE_MODEL") ?? "",
    inferenceVerifyModel: env("VULTR_INFERENCE_VERIFY_MODEL") ?? "",
    provider: env("SANDBOX_PROVIDER") ?? "docker",
    spec: { ...DEFAULT_SPEC, image: env("SANDBOX_IMAGE") ?? "scudra-sandbox:latest" },
    receiptPrivateKey: privateKey,
    receiptPublicKey: publicKey,
    receiptKeyId: id,
    maxConcurrent: Number(env("MAX_CONCURRENT_SANDBOXES") ?? 3) || 3,
    trustProxy: env("TRUST_PROXY") === "1",
  }
}

/**
 * The receipt signing keys.
 *
 * Receipts are signed with Ed25519 so a THIRD PARTY can verify them with
 * the public key alone — an HMAC only proves the record to whoever holds the
 * secret, which is not the point of a receipt.
 *
 * A KEY FILE is the preferred way to supply the key, and it is not a
 * preference: a PEM is multi-line, and systemd's EnvironmentFile parser
 * consumes the backslash in a "\n" escape, leaving a bare "n" and an
 * unparseable key. That failure surfaces as an opaque decoder error inside a
 * crypto library, several layers from the cause. A file cannot be mangled
 * this way.
 *
 * The private key may be configured on its own; the public key is then
 * derived from it. With neither configured, an ephemeral pair is generated so
 * the app still runs — but those receipts cannot be verified by anyone else,
 * and the UI says so.
 */
function loadSigningKeys(): { privateKey: string; publicKey: string; id: string } {
  // 1. A key file — the only form that survives systemd.
  const keyFile = env("RECEIPT_SIGNING_KEY_FILE")
  if (keyFile) {
    const privateKey = readKeyFile(keyFile)
    const publicFile = env("RECEIPT_PUBLIC_KEY_FILE")
    const publicKey = publicFile ? readKeyFile(publicFile) : publicKeyFromPrivate(privateKey)
    return { privateKey, publicKey, id: keyId(publicKey) }
  }

  // 2. An environment variable, for local development where nothing
  //    reinterprets the value between the file and the process.
  const rawPrivate = (env("RECEIPT_SIGNING_KEY") ?? "").replace(/\\n/g, "\n")
  const rawPublic = (env("RECEIPT_PUBLIC_KEY") ?? "").replace(/\\n/g, "\n")

  if (rawPrivate) {
    const privateKey = rawPrivate.replace(/\\n/g, "\n")
    const publicKey = rawPublic ? rawPublic.replace(/\\n/g, "\n") : publicKeyFromPrivate(privateKey)
    return { privateKey, publicKey, id: keyId(publicKey) }
  }

  if (rawPublic) {
    // A public key alone can verify but not sign — the app still needs a
    // private key to produce receipts, so generate an ephemeral one.
    const generated = generateKeyPair()
    return {
      privateKey: generated.privateKeyPem,
      publicKey: generated.publicKeyPem,
      id: keyId(generated.publicKeyPem),
    }
  }

  const generated = generateKeyPair()
  return {
    privateKey: generated.privateKeyPem,
    publicKey: generated.publicKeyPem,
    id: keyId(generated.publicKeyPem),
  }
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

export function configProblem(c: Config): string | null {
  if (!c.inferenceKey) return "VULTR_INFERENCE_API_KEY is not set."
  if (!c.inferenceModel) return "VULTR_INFERENCE_MODEL is not set."
  return null
}

/**
 * True when the receipt key was generated at boot rather than configured.
 *
 * This is not fatal — the app works and receipts verify against the
 * generated public key — but those receipts cannot be verified by ANYONE
 * else, and the key changes on every restart, which breaks any receipt a
 * third party has already archived. Worth saying out loud.
 */
export function signingKeyIsEphemeral(): boolean {
  return !env("RECEIPT_SIGNING_KEY_FILE") && !env("RECEIPT_SIGNING_KEY")
}

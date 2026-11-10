// Runtime configuration. Secrets live HERE, on the control plane, and are
// never passed into a sandbox.

import { DEFAULT_SPEC, type SandboxSpec } from "./providers/types.js"
import { generateKeyPair, keyId, publicKeyFromPrivate } from "@scudra/evidence"

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
 * The private key may be configured on its own; the public key is then
 * derived from it. With neither configured, an ephemeral pair is generated so
 * the app still runs — but those receipts cannot be verified by anyone else,
 * and the UI says so.
 *
 * A PEM in an environment variable arrives with literal "\n" sequences, so
 * those are expanded here.
 */
function loadSigningKeys(): { privateKey: string; publicKey: string; id: string } {
  const rawPrivate = env("RECEIPT_SIGNING_KEY") ?? ""
  const rawPublic = env("RECEIPT_PUBLIC_KEY") ?? ""

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

export function configProblem(c: Config): string | null {
  if (!c.inferenceKey) return "VULTR_INFERENCE_API_KEY is not set."
  if (!c.inferenceModel) return "VULTR_INFERENCE_MODEL is not set."
  return null
}

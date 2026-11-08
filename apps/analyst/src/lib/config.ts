// Runtime configuration. Secrets live HERE, on the control plane, and are
// never passed into a sandbox.

import { DEFAULT_SPEC, type SandboxSpec } from "./providers/types.js"

export interface Config {
  inferenceBaseUrl: string
  inferenceKey: string
  inferenceModel: string
  /** Optional second model for the verifier pass (a different family is ideal). */
  inferenceVerifyModel: string
  provider: string
  spec: SandboxSpec
  receiptSecret: string
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
  return {
    inferenceBaseUrl: (env("VULTR_INFERENCE_BASE_URL") ?? "https://api.vultrinference.com/v1").replace(/\/$/, ""),
    inferenceKey: env("VULTR_INFERENCE_API_KEY") ?? "",
    inferenceModel: env("VULTR_INFERENCE_MODEL") ?? "",
    inferenceVerifyModel: env("VULTR_INFERENCE_VERIFY_MODEL") ?? "",
    provider: env("SANDBOX_PROVIDER") ?? "docker",
    spec: { ...DEFAULT_SPEC, image: env("SANDBOX_IMAGE") ?? "scudra-sandbox:latest" },
    receiptSecret: env("RECEIPT_SECRET") ?? "",
    maxConcurrent: Number(env("MAX_CONCURRENT_SANDBOXES") ?? 3) || 3,
    trustProxy: env("TRUST_PROXY") === "1",
  }
}

export function configProblem(c: Config): string | null {
  if (!c.inferenceKey) return "VULTR_INFERENCE_API_KEY is not set."
  if (!c.inferenceModel) return "VULTR_INFERENCE_MODEL is not set."
  if (c.receiptSecret.length < 16) return "RECEIPT_SECRET must be set (16+ chars; `openssl rand -hex 32`)."
  return null
}

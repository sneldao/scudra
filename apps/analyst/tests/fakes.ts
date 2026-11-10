import type { AnalystEvent } from "../src/lib/events.js"
import {
  DEFAULT_SPEC,
  type Artifact,
  type ExecResult,
  type Sandbox,
  type SandboxProvider,
} from "../src/lib/providers/types.js"
import { generateKeyPair, keyId } from "@scudra/evidence"

export const spec = { ...DEFAULT_SPEC, image: "scudra-sandbox:latest" }

// A fixed key pair, so a receipt signed in one test can be verified in
// another without threading key material through every call site.
export const signingKeys = generateKeyPair()
export const config = {
  spec,
  receiptPrivateKey: signingKeys.privateKeyPem,
  receiptPublicKey: signingKeys.publicKeyPem,
  receiptKeyId: keyId(signingKeys.publicKeyPem),
  inferenceModel: "test-model",
}
export const ok = (stdout: string): ExecResult => ({ exitCode: 0, stdout, stderr: "", timedOut: false, durationMs: 5 })
export const bad: ExecResult = { exitCode: 1, stdout: "", stderr: "NameError: x", timedOut: false, durationMs: 5 }

export function fakeProvider(results: ExecResult[], artifacts: Artifact[] = []) {
  const log = { destroyed: 0, execs: [] as string[], files: {} as Record<string, string> }
  const sandbox: Sandbox = {
    id: "fake-1",
    writeFile: async (p, c) => void (log.files[p] = c),
    exec: async (code) => (log.execs.push(code), results.shift() ?? ok("")),
    collect: async () => artifacts,
    destroy: async () => (log.destroyed++, { verified: true }),
  }
  const provider: SandboxProvider = { name: "fake", create: async () => sandbox, health: async () => [] }
  return { provider, log }
}

export const collect = () => {
  const events: AnalystEvent[] = []
  return { events, on: (e: AnalystEvent) => void events.push(e) }
}
export const py = (c: string) => "```python\n" + c + "\n```"

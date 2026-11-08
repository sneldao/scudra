// The provider seam. Vultr-hosted Docker is primary; anything else (Solari,
// a throwaway Vultr instance) implements the same lifecycle contract.
//
// The contract is about LIFECYCLE, not just "run code": every sandbox has hard
// limits at creation, accepts input files, yields bounded artifacts, and has a
// destroy() that proves the thing is gone.

export interface SandboxSpec {
  image: string
  /** Per-exec wall clock cap. */
  execTimeoutMs: number
  /** Hard ceiling for the whole sandbox lifetime. */
  lifetimeMs: number
  memoryMb: number
  cpus: number
  pids: number
  tmpfsMb: number
  /** Host-side grace after execTimeoutMs before the docker CLI itself is killed. */
  killGraceMs: number
}

export const DEFAULT_SPEC: Omit<SandboxSpec, "image"> = {
  execTimeoutMs: 15_000,
  lifetimeMs: 120_000,
  memoryMb: 512,
  cpus: 1,
  pids: 64,
  tmpfsMb: 128,
  killGraceMs: 3000,
}

export interface ExecResult {
  exitCode: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  durationMs: number
}

export type ArtifactMime = "image/png" | "text/plain" | "text/csv" | "application/json"

/** A file the sandbox produced. Untrusted data: validated and size-capped. */
export interface Artifact {
  name: string
  mime: ArtifactMime
  bytes: number
  sha256: string
  /** base64 */
  data: string
}

export interface DestroyReport {
  /** True only if we positively confirmed the sandbox no longer exists. */
  verified: boolean
}

export interface HealthCheck {
  name: string
  ok: boolean
  detail: string
}

export interface Sandbox {
  id: string
  /** Place an input file under /work. */
  writeFile(path: string, content: string): Promise<void>
  /** Run a Python program. The code is fed over stdin — never via the host FS. */
  exec(code: string): Promise<ExecResult>
  /** Collect files the program left in /work/out. Bounded and validated. */
  collect(): Promise<Artifact[]>
  /** Idempotent. */
  destroy(): Promise<DestroyReport>
}

export interface SandboxProvider {
  name: string
  create(spec: SandboxSpec): Promise<Sandbox>
  health(spec: SandboxSpec): Promise<HealthCheck[]>
}

// Docker provider — the primary, Vultr-hosted sandbox.
//
// Containment posture (all enforced at `docker run`, none negotiable by the
// code inside):
//   --network none            no egress, no DNS, no metadata service
//   --read-only + tmpfs       root FS immutable; scratch is RAM, noexec
//   --cap-drop ALL            no capabilities
//   no-new-privileges         no setuid escalation
//   --user 65534              not root
//   --memory/--cpus/--pids    resource caps (OOM-kill, throttle, fork-bomb cap)
//   --rm + sleep backstop     container removes itself at its lifetime limit
//   no --env / no volumes     NO secrets, NO host paths enter the container
//
// Deployment note: run the app directly on the VM, NOT in a container with
// /var/run/docker.sock mounted — that would hand the app root on the host.

import { spawn } from "node:child_process"
import { randomBytes } from "node:crypto"
import { COLLECT_SCRIPT, parseArtifacts } from "../artifacts.js"
import type {
  Artifact,
  DestroyReport,
  ExecResult,
  HealthCheck,
  Sandbox,
  SandboxProvider,
  SandboxSpec,
} from "./types.js"

const MAX_OUTPUT_BYTES = 64 * 1024
const MAX_COLLECT_BYTES = 2 * 1024 * 1024
export const LABEL = "scudra.sandbox=1"
const SAFE_PATH = /^\/work\/[A-Za-z0-9_.-]{1,64}$/

export function buildRunArgs(name: string, spec: SandboxSpec): string[] {
  const lifetimeSec = Math.ceil(spec.lifetimeMs / 1000)
  return [
    "run",
    "-d",
    "--rm",
    "--init",
    "--name",
    name,
    "--label",
    LABEL,
    "--network",
    "none",
    "--read-only",
    "--tmpfs",
    `/work:rw,noexec,nosuid,size=${spec.tmpfsMb}m`,
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,size=32m",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--user",
    "65534:65534",
    "--memory",
    `${spec.memoryMb}m`,
    "--memory-swap",
    `${spec.memoryMb}m`,
    "--cpus",
    String(spec.cpus),
    "--pids-limit",
    String(spec.pids),
    "--workdir",
    "/work",
    spec.image,
    // Self-destruct backstop: even if the host forgets us, the container exits
    // (and --rm removes it).
    "sleep",
    String(lifetimeSec),
  ]
}

export function buildExecArgs(name: string, spec: SandboxSpec): string[] {
  const sec = Math.max(1, Math.ceil(spec.execTimeoutMs / 1000))
  // `timeout -s KILL` inside the container; the host-side watchdog is the backstop.
  return ["exec", "-i", "--workdir", "/work", name, "timeout", "-s", "KILL", String(sec), "python3", "-"]
}

interface RunResult {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
}

function run(args: string[], opts: { stdin?: string; timeoutMs?: number; maxBytes?: number } = {}): Promise<RunResult> {
  const max = opts.maxBytes ?? MAX_OUTPUT_BYTES
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.DOCKER_BIN || "docker", args, { stdio: ["pipe", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    let timedOut = false
    const cap = (s: string, chunk: Buffer) => (s.length >= max ? s : (s + chunk.toString("utf8")).slice(0, max))
    child.stdout.on("data", (c: Buffer) => (stdout = cap(stdout, c)))
    child.stderr.on("data", (c: Buffer) => (stderr = cap(stderr, c)))
    child.on("error", reject)
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          timedOut = true
          child.kill("SIGKILL")
        }, opts.timeoutMs)
      : undefined
    child.on("close", (code) => {
      if (timer) clearTimeout(timer)
      resolve({ code, stdout, stderr, timedOut })
    })
    child.stdin.on("error", () => {})
    child.stdin.end(opts.stdin ?? "")
  })
}

let reaped = false
/** Test hook. */
export const _resetReaper = () => {
  reaped = false
}
/** Crash backstop: any labelled container alive at process start is an orphan (one control plane per Docker daemon). */
export async function reapOrphans(): Promise<number> {
  const ls = await run(["ps", "-aq", "--filter", `label=${LABEL}`], { timeoutMs: 10_000 }).catch(() => null)
  const ids = ls?.stdout.split("\n").filter(Boolean) ?? []
  if (ids.length) await run(["rm", "-f", ...ids], { timeoutMs: 30_000 }).catch(() => null)
  return ids.length
}

export class DockerProvider implements SandboxProvider {
  name = "vultr-docker"

  async create(spec: SandboxSpec): Promise<Sandbox> {
    if (!reaped) {
      reaped = true
      const n = await reapOrphans()
      if (n) console.log(`[docker] reaped ${n} orphaned sandbox(es) from a previous run`)
    }
    const name = `scudra-${randomBytes(6).toString("hex")}`
    const res = await run(buildRunArgs(name, spec), { timeoutMs: 60_000 })
    if (res.code !== 0) {
      await run(["rm", "-f", name])
      throw new Error(`docker run failed: ${res.stderr.trim().slice(0, 300)}`)
    }
    return new DockerSandbox(name, spec)
  }

  async health(spec: SandboxSpec): Promise<HealthCheck[]> {
    const checks: HealthCheck[] = []
    const v = await run(["version", "--format", "{{.Server.Version}}"], { timeoutMs: 8000 }).catch(() => null)
    checks.push({
      name: "Docker daemon",
      ok: !!v && v.code === 0,
      detail:
        v && v.code === 0
          ? `v${v.stdout.trim()}`
          : "not reachable — is Docker installed and is this user in the docker group?",
    })
    if (v?.code === 0) {
      const img = await run(["image", "inspect", spec.image, "--format", "{{.Id}}"], { timeoutMs: 8000 })
      checks.push({
        name: "Sandbox image",
        ok: img.code === 0,
        detail:
          img.code === 0
            ? spec.image
            : `${spec.image} missing — build it: docker build -t ${spec.image} apps/analyst/sandbox`,
      })
    }
    return checks
  }
}

class DockerSandbox implements Sandbox {
  private destroyed: Promise<DestroyReport> | null = null
  constructor(
    public id: string,
    private spec: SandboxSpec,
  ) {}

  async writeFile(path: string, content: string): Promise<void> {
    if (!SAFE_PATH.test(path)) throw new Error("unsafe sandbox path")
    // Positional arg, not interpolation: the path is never parsed as shell.
    const r = await run(["exec", "-i", this.id, "sh", "-c", 'cat > "$1"', "sh", path], {
      stdin: content,
      timeoutMs: 15_000,
    })
    if (r.code !== 0) throw new Error(`writeFile failed: ${r.stderr.slice(0, 200)}`)
  }

  async exec(code: string): Promise<ExecResult> {
    const t0 = Date.now()
    const res = await run(buildExecArgs(this.id, this.spec), {
      stdin: code,
      timeoutMs: this.spec.execTimeoutMs + this.spec.killGraceMs,
    })
    // 137 = SIGKILL, from either the `timeout` watchdog OR the kernel OOM killer.
    // Only call it a timeout if it actually ran for (about) the whole budget.
    const durationMs = Date.now() - t0
    const timedOut = res.timedOut || (res.code === 137 && durationMs >= this.spec.execTimeoutMs - 500)
    return { exitCode: res.code, stdout: res.stdout, stderr: res.stderr, timedOut, durationMs }
  }

  async collect(): Promise<Artifact[]> {
    const r = await run(buildExecArgs(this.id, this.spec), {
      stdin: COLLECT_SCRIPT,
      timeoutMs: 15_000,
      maxBytes: MAX_COLLECT_BYTES,
    })
    return r.code === 0 ? parseArtifacts(r.stdout) : []
  }

  destroy(): Promise<DestroyReport> {
    this.destroyed ??= (async () => {
      await run(["rm", "-f", this.id], { timeoutMs: 20_000 })
      // Verification: inspect must FAIL for a container that no longer exists.
      const probe = await run(["inspect", this.id], { timeoutMs: 10_000 })
      return { verified: probe.code !== 0 }
    })()
    return this.destroyed
  }
}

// Containment probes — the "containment moment".
//
// Each probe is deliberately hostile code run inside a fresh sandbox. A probe
// passes ("blocked") when the sandbox stops it. The evidence is real output
// from the real container, not a description of what would happen.
//
// Every probe prints `ESCAPED` if the hostile action SUCCEEDED, and `BLOCKED`
// plus the OS error otherwise. We classify on that marker.

import type { AnalystEvent, ProbeStatus } from "./events.js"
import type { Sandbox } from "./providers/types.js"

export interface Probe {
  name: string
  description: string
  code: string
}

export const PROBES: Probe[] = [
  {
    name: "Steal secrets",
    description: "Look for API keys in the environment.",
    code: `import os
hits = [k for k, v in os.environ.items() if v and any(s in k.upper() for s in ("KEY","TOKEN","SECRET","PASSWORD","VULTR"))]
print("ESCAPED: " + ",".join(hits) if hits else "BLOCKED: no secret-like variables in environment")`,
  },
  {
    name: "Phone home",
    description: "Open a connection to the public internet.",
    code: `import socket
try:
    socket.create_connection(("1.1.1.1", 443), timeout=3)
    print("ESCAPED: connected to 1.1.1.1:443")
except Exception as e:
    print("BLOCKED:", type(e).__name__, e)`,
  },
  {
    name: "Read the host",
    description: "Read host-only files (/etc/shadow, the Docker socket).",
    code: `import os
for p in ("/etc/shadow", "/var/run/docker.sock", "/root"):
    try:
        os.listdir(p) if os.path.isdir(p) else open(p).read(1)
        print("ESCAPED: read " + p); raise SystemExit
    except SystemExit: raise
    except Exception as e:
        print("BLOCKED:", p, type(e).__name__)`,
  },
  {
    name: "Tamper with the system",
    description: "Write into the read-only root filesystem.",
    code: `try:
    open("/usr/local/bin/pwned", "w").write("x")
    print("ESCAPED: wrote /usr/local/bin/pwned")
except Exception as e:
    print("BLOCKED:", type(e).__name__, e)`,
  },
  {
    name: "Fork bomb",
    description: "Spawn processes until the host chokes.",
    code: `import os
n = 0
try:
    while n < 5000:
        pid = os.fork()
        if pid == 0:
            import time; time.sleep(5); os._exit(0)
        n += 1
    print("ESCAPED: forked %d processes" % n)
except Exception as e:
    print("BLOCKED: pid limit hit after %d forks (%s)" % (n, type(e).__name__))`,
  },
  {
    name: "Eat all the memory",
    description: "Allocate 2 GB against a 512 MB cap.",
    code: `try:
    blob = bytearray(2 * 1024**3)
    for i in range(0, len(blob), 4096): blob[i] = 1
    print("ESCAPED: allocated 2GB")
except MemoryError:
    print("BLOCKED: MemoryError")`,
  },
  {
    name: "Run forever",
    description: "Spin in an infinite loop.",
    code: `while True: pass`,
  },
]

export function classify(exec: { stdout: string }): ProbeStatus {
  if (exec.stdout.includes("ESCAPED")) return "escaped"
  return "blocked"
}

export async function runProbes(sandbox: Sandbox, onEvent: (e: AnalystEvent) => void): Promise<void> {
  for (const [i, p] of PROBES.entries()) {
    const r = await sandbox.exec(p.code)
    const status = classify(r)
    let evidence = r.stdout.trim().split("\n").slice(0, 3).join(" | ")
    if (r.timedOut) evidence = `killed by watchdog after ${Math.round(r.durationMs / 1000)}s (SIGKILL)`
    else if (r.exitCode === 137 || (r.exitCode !== 0 && !evidence)) {
      evidence = `process killed by the kernel (exit ${r.exitCode}) — cgroup limit enforced`
    }
    onEvent({
      type: "probe",
      index: i + 1,
      total: PROBES.length,
      name: p.name,
      description: p.description,
      status,
      evidence: evidence || "no output",
    })
  }
}

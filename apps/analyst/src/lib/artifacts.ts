// Artifacts come out of an untrusted environment, so they are parsed
// defensively: strict names, an extension allowlist (no SVG/HTML — they can
// carry script), PNG magic-byte check, and hard size caps.

import { createHash } from "node:crypto"
import type { Artifact, ArtifactMime } from "./providers/types.js"

const MIME: Record<string, ArtifactMime> = {
  png: "image/png",
  csv: "text/csv",
  txt: "text/plain",
  json: "application/json",
}
const NAME = /^[A-Za-z0-9_.-]{1,64}$/
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47])
export const MAX_ARTIFACTS = 8
export const MAX_ARTIFACT_BYTES = 400_000

/** Runs INSIDE the sandbox (it is our code, but it executes in the container). */
export const COLLECT_SCRIPT = `import os, json, base64
OUT = "/work/out"
total = 0
res = []
if os.path.isdir(OUT):
    for n in sorted(os.listdir(OUT))[:${MAX_ARTIFACTS}]:
        p = os.path.join(OUT, n)
        if os.path.islink(p) or not os.path.isfile(p):
            continue
        sz = os.path.getsize(p)
        if sz > ${MAX_ARTIFACT_BYTES} or total + sz > 900000:
            continue
        total += sz
        res.append({"name": n, "b64": base64.b64encode(open(p, "rb").read()).decode()})
print(json.dumps(res))
`

export function makeArtifact(name: string, mime: ArtifactMime, buf: Buffer): Artifact {
  return {
    name,
    mime,
    bytes: buf.length,
    sha256: createHash("sha256").update(buf).digest("hex"),
    data: buf.toString("base64"),
  }
}

export function parseArtifacts(stdout: string): Artifact[] {
  let raw: unknown
  try {
    raw = JSON.parse(stdout.trim().split("\n").pop() ?? "")
  } catch {
    return []
  }
  if (!Array.isArray(raw)) return []
  const out: Artifact[] = []
  for (const item of raw.slice(0, MAX_ARTIFACTS)) {
    if (!item || typeof item !== "object") continue
    const { name, b64 } = item as { name?: unknown; b64?: unknown }
    if (typeof name !== "string" || typeof b64 !== "string" || !NAME.test(name)) continue
    const mime = MIME[name.split(".").pop()!.toLowerCase()]
    if (!mime) continue
    const buf = Buffer.from(b64, "base64")
    if (buf.length === 0 || buf.length > MAX_ARTIFACT_BYTES) continue
    if (mime === "image/png" && !buf.subarray(0, 4).equals(PNG_MAGIC)) continue
    out.push(makeArtifact(name, mime, buf))
  }
  return out
}

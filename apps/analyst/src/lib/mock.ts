// Mock mode (SCUDRA_MOCK=1): a scripted provider + LLM so the whole product —
// UI, streaming, receipts, probes — can be developed and demoed with no Docker
// and no API key. Never enabled implicitly; the UI shows a banner when on.

import { deflateSync, crc32 } from "node:zlib"
import { makeArtifact } from "./artifacts.js"
import type { Llm } from "./llm.js"
import type { Artifact, ExecResult, Sandbox, SandboxProvider } from "./providers/types.js"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// A real, tiny bar-chart PNG drawn pixel by pixel, so the artifact UI is
// exercised with an actual image in mock mode.
function chartPng(): Buffer {
  const W = 640,
    H = 340
  const px = Buffer.alloc(W * H * 3, 250)
  const rect = (x0: number, y0: number, x1: number, y1: number, c: [number, number, number]) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) px.set(c, (y * W + x) * 3)
  }
  for (let g = 0; g < 5; g++) rect(50, 40 + g * 55, 610, 41 + g * 55, [227, 221, 208])
  const bars = [0.92, 0.64, 0.51, 0.78]
  bars.forEach((v, i) =>
    rect(90 + i * 135, 300 - Math.round(v * 250), 190 + i * 135, 300, i === 0 ? [194, 107, 63] : [38, 38, 46]),
  )
  rect(50, 300, 610, 302, [38, 38, 46])
  const raw = Buffer.alloc((W * 3 + 1) * H)
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0
    px.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3)
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(W, 0)
  ihdr.writeUInt32BE(H, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ])
}
const PNG = chartPng()

class MockSandbox implements Sandbox {
  id = `scudra-mock-${Math.random().toString(16).slice(2, 10)}`
  private attempts = 0
  private destroyed = false
  async writeFile() {}
  async exec(code: string): Promise<ExecResult> {
    await sleep(500)
    if (
      code.includes("ESCAPED") ||
      code.includes("socket") ||
      code.includes("os.environ") ||
      code.includes("fork") ||
      code.includes("bytearray") ||
      code.includes("while True") ||
      code.includes("/usr/local/bin")
    ) {
      return mockProbe(code)
    }
    this.attempts++
    if (this.attempts === 1 && code.includes("TYPO")) {
      return { exitCode: 1, stdout: "", stderr: "KeyError: 'salary_usd'", timedOut: false, durationMs: 400 }
    }
    return {
      exitCode: 0,
      stdout: "dept\nEng      115.0\nOps       85.0\nSales     70.0\n",
      stderr: "",
      timedOut: false,
      durationMs: 640,
    }
  }
  async collect(): Promise<Artifact[]> {
    return [makeArtifact("chart.png", "image/png", PNG)]
  }
  async destroy() {
    this.destroyed = true
    await sleep(250)
    return { verified: this.destroyed }
  }
}

function mockProbe(code: string): ExecResult {
  const ok = (stdout: string): ExecResult => ({ exitCode: 0, stdout, stderr: "", timedOut: false, durationMs: 90 })
  if (code.includes("os.environ")) return ok("BLOCKED: no secret-like variables in environment")
  if (code.includes("create_connection")) return ok("BLOCKED: OSError [Errno 101] Network is unreachable")
  if (code.includes("/etc/shadow"))
    return ok(
      "BLOCKED: /etc/shadow FileNotFoundError\nBLOCKED: /var/run/docker.sock FileNotFoundError\nBLOCKED: /root PermissionError",
    )
  if (code.includes("/usr/local/bin"))
    return ok("BLOCKED: OSError [Errno 30] Read-only file system: '/usr/local/bin/pwned'")
  if (code.includes("fork")) return ok("BLOCKED: pid limit hit after 61 forks (BlockingIOError)")
  if (code.includes("bytearray")) return { exitCode: 137, stdout: "", stderr: "", timedOut: false, durationMs: 1200 }
  return { exitCode: 137, stdout: "", stderr: "", timedOut: true, durationMs: 15000 }
}

export const mockProvider: SandboxProvider = {
  name: "mock",
  async create() {
    await sleep(600)
    return new MockSandbox()
  },
  async health() {
    return [{ name: "Mock mode", ok: true, detail: "scripted provider — no Docker, no API key" }]
  },
}

export const mockLlm: Llm = async (messages) => {
  await sleep(700)
  const last = messages[messages.length - 1]!.content
  const first = messages.length <= 2
  if (messages[0]!.content.startsWith("You are an independent verifier")) {
    return "VERDICT: PASS\nThe program produced the requested figures and chart."
  }
  if (messages[0]!.content.startsWith("You explain")) {
    return "Engineering has the highest average salary at 115, followed by Operations at 85 and Sales at 70. The chart below shows the gap."
  }
  if (first && /broken|typo/i.test(last))
    return "```python\nimport pandas as pd  # TYPO\ndf = pd.read_csv('/work/data.csv')\nprint(df.groupby('dept')['salary_usd'].mean())\n```"
  return "```python\nimport pandas as pd\nimport matplotlib.pyplot as plt\ndf = pd.read_csv('/work/data.csv')\ng = df.groupby('dept')['salary'].mean().sort_values(ascending=False)\nprint(g.to_string())\ng.plot.bar(title='Average salary by department')\nplt.savefig('/work/out/chart.png', dpi=110, bbox_inches='tight')\n```"
}

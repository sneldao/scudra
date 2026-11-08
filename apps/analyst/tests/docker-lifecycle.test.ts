// Drives the REAL DockerProvider code (spawn, stdin, timeouts, output caps,
// destroy verification, reaper) against a fake `docker` binary. This cannot
// prove the kernel enforces the flags — only a real VPS run can — but it does
// prove our process handling is correct before we ever get there.

import { mkdtempSync, existsSync, readFileSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { DockerProvider, reapOrphans } from "../src/lib/providers/docker.js"
import { spec as baseSpec } from "./fakes.js"

const spec = { ...baseSpec, execTimeoutMs: 1000, killGraceMs: 300 }
let dir: string
const calls = () =>
  readFileSync(join(dir, "calls.log"), "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as string[])
const ENV_KEYS = ["FAKE_DOCKER_RUN_FAIL", "FAKE_DOCKER_RM_FAIL", "FAKE_DOCKER_NO_IMAGE", "FAKE_DOCKER_ARTIFACTS"]

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fakedocker-"))
  mkdirSync(join(dir, "c"), { recursive: true })
  process.env.FAKE_DOCKER_STATE = dir
  process.env.DOCKER_BIN = resolve(__dirname, "fixtures/fake-docker.mjs")
})
afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k]
  delete process.env.DOCKER_BIN
  rmSync(dir, { recursive: true, force: true })
})

describe("DockerProvider against a fake docker", () => {
  it("spawns `docker run` with the hardening flags the tests pin", async () => {
    const p = new DockerProvider()
    const sb = await p.create(spec)
    const run = calls()
      .find((c) => c[0] === "run")!
      .join(" ")
    expect(run).toContain("--network none")
    expect(run).toContain("--cap-drop ALL")
    expect(run).not.toMatch(/--env| -e |--volume| -v |docker\.sock/)
    expect(existsSync(join(dir, "c", sb.id))).toBe(true)
    await sb.destroy()
  })

  it("exec returns stdout and feeds the program over stdin (never argv)", async () => {
    const sb = await new DockerProvider().create(spec)
    const r = await sb.exec("print('hello')\n")
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toBe("ran:15\n")
    expect(r.timedOut).toBe(false)
    const exec = calls()
      .filter((c) => c[0] === "exec")
      .at(-1)!
    expect(exec.join(" ")).not.toContain("hello")
    await sb.destroy()
  })

  it("reports a non-zero exit with stderr", async () => {
    const sb = await new DockerProvider().create(spec)
    const r = await sb.exec("#FAIL")
    expect(r.exitCode).toBe(1)
    expect(r.stderr).toContain("NameError")
    await sb.destroy()
  })

  it("an instant exit 137 is an OOM kill, not a timeout", async () => {
    const sb = await new DockerProvider().create(spec)
    const r = await sb.exec("#OOM")
    expect(r.exitCode).toBe(137)
    expect(r.timedOut).toBe(false)
    await sb.destroy()
  })

  it("kills a hung exec at the host watchdog and reports timedOut", async () => {
    const sb = await new DockerProvider().create(spec)
    const t0 = Date.now()
    const r = await sb.exec("#SLEEP")
    expect(r.timedOut).toBe(true)
    expect(Date.now() - t0).toBeLessThan(2500)
    await sb.destroy()
  })

  it("caps runaway output", async () => {
    const sb = await new DockerProvider().create(spec)
    const r = await sb.exec("#BIGOUT")
    expect(r.stdout.length).toBeLessThanOrEqual(64 * 1024)
    await sb.destroy()
  })

  it("writeFile pipes content over stdin, and refuses unsafe paths", async () => {
    const sb = await new DockerProvider().create(spec)
    await sb.writeFile("/work/data.csv", "a,b\n1,2\n")
    expect(readFileSync(join(dir, "c", sb.id, "files", "data.csv"), "utf8")).toBe("a,b\n1,2\n")
    for (const bad of ["/etc/passwd", "/work/../etc/x", "/work/a b", "/work/$(id)", "data.csv", "/work/x;rm"]) {
      await expect(sb.writeFile(bad, "x")).rejects.toThrow(/unsafe/)
    }
    await sb.destroy()
  })

  it("collect() parses artifacts from the container and drops invalid ones", async () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(8, 2)]).toString("base64")
    process.env.FAKE_DOCKER_ARTIFACTS = JSON.stringify([
      { name: "chart.png", b64: png },
      { name: "evil.svg", b64: Buffer.from("<svg onload=x>").toString("base64") },
    ])
    const sb = await new DockerProvider().create(spec)
    const a = await sb.collect()
    expect(a.map((x) => x.name)).toEqual(["chart.png"])
    await sb.destroy()
  })

  it("destroy removes the container and verifies it is gone; it is idempotent", async () => {
    const sb = await new DockerProvider().create(spec)
    const [a, b] = await Promise.all([sb.destroy(), sb.destroy()])
    expect(a.verified).toBe(true)
    expect(b).toBe(a)
    expect(existsSync(join(dir, "c", sb.id))).toBe(false)
    expect(calls().filter((c) => c[0] === "rm")).toHaveLength(1)
  })

  it("does NOT claim verified when the container survives `rm`", async () => {
    process.env.FAKE_DOCKER_RM_FAIL = "1"
    const sb = await new DockerProvider().create(spec)
    expect((await sb.destroy()).verified).toBe(false)
  })

  it("a failed `docker run` throws a clean error and cleans up", async () => {
    process.env.FAKE_DOCKER_RUN_FAIL = "1"
    await expect(new DockerProvider().create(spec)).rejects.toThrow(/docker run failed/)
    expect(calls().some((c) => c[0] === "rm")).toBe(true)
  })

  it("reapOrphans removes leftover labelled containers", async () => {
    mkdirSync(join(dir, "c", "scudra-orphan1"))
    mkdirSync(join(dir, "c", "scudra-orphan2"))
    expect(await reapOrphans()).toBe(2)
    expect(existsSync(join(dir, "c", "scudra-orphan1"))).toBe(false)
  })

  it("health: reports a missing image with the exact build command", async () => {
    process.env.FAKE_DOCKER_NO_IMAGE = "1"
    const checks = await new DockerProvider().health(spec)
    expect(checks[0]).toMatchObject({ name: "Docker daemon", ok: true })
    expect(checks[1]).toMatchObject({ name: "Sandbox image", ok: false })
    expect(checks[1]!.detail).toContain("docker build -t")
  })

  it("health: a missing docker binary is reported, not thrown", async () => {
    process.env.DOCKER_BIN = "/nonexistent/docker"
    const checks = await new DockerProvider().health(spec)
    expect(checks[0]).toMatchObject({ name: "Docker daemon", ok: false })
  })
})

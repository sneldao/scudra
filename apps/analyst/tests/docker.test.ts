import { describe, expect, it } from "vitest"
import { buildExecArgs, buildRunArgs, LABEL } from "../src/lib/providers/docker.js"
import { spec } from "./fakes.js"

describe("docker containment flags", () => {
  const args = buildRunArgs("c1", spec).join(" ")
  it("has no network, read-only root, no caps, non-root", () => {
    expect(args).toContain("--network none")
    expect(args).toContain("--read-only")
    expect(args).toContain("--cap-drop ALL")
    expect(args).toContain("no-new-privileges")
    expect(args).toContain("--user 65534:65534")
  })
  it("caps memory (swap off), cpu, pids", () => {
    expect(args).toContain(`--memory ${spec.memoryMb}m`)
    expect(args).toContain(`--memory-swap ${spec.memoryMb}m`)
    expect(args).toContain(`--cpus ${spec.cpus}`)
    expect(args).toContain(`--pids-limit ${spec.pids}`)
  })
  it("passes no env, no volumes, no docker socket, no privilege", () => {
    expect(args).not.toMatch(/(^| )-e |--env|-v |--volume|--mount|docker\.sock|--privileged|--network host/)
  })
  it("self-destructs: --rm, lifetime backstop, and an orphan-reaper label", () => {
    expect(args).toContain("--rm")
    expect(args).toContain(`sleep ${spec.lifetimeMs / 1000}`)
    expect(args).toContain(LABEL)
  })
  it("scratch space is noexec RAM", () => {
    expect(args).toMatch(/--tmpfs \/work:rw,noexec,nosuid/)
  })
  it("exec feeds code over stdin with a kill timeout", () => {
    expect(buildExecArgs("c1", spec).join(" ")).toContain(`timeout -s KILL ${spec.execTimeoutMs / 1000} python3 -`)
  })
})

#!/usr/bin/env node
// A stand-in `docker` CLI for tests. Keeps state as directories under
// $FAKE_DOCKER_STATE/c/<name>, logs every invocation to calls.log, and
// misbehaves on demand via markers in the program text (stdin) or env vars.
import fs from "node:fs"
import path from "node:path"

const dir = process.env.FAKE_DOCKER_STATE
const args = process.argv.slice(2)
fs.appendFileSync(path.join(dir, "calls.log"), JSON.stringify(args) + "\n")
const cdir = (n) => path.join(dir, "c", n)
const exists = (n) => fs.existsSync(cdir(n))
const stdin = () =>
  new Promise((r) => {
    let s = ""
    process.stdin.on("data", (d) => (s += d))
    process.stdin.on("end", () => r(s))
  })
const out = (s) => process.stdout.write(s)
const fail = (msg, code = 1) => {
  process.stderr.write(msg + "\n")
  process.exit(code)
}

switch (args[0]) {
  case "version":
    out("27.0.0\n")
    break
  case "image":
    if (process.env.FAKE_DOCKER_NO_IMAGE) fail("No such image")
    else out("sha256:abc\n")
    break
  case "run": {
    if (process.env.FAKE_DOCKER_RUN_FAIL) fail("docker: Error response from daemon: boom", 125)
    const name = args[args.indexOf("--name") + 1]
    fs.mkdirSync(path.join(cdir(name), "files"), { recursive: true })
    out("deadbeef" + name + "\n")
    break
  }
  case "exec": {
    let i = 1
    while (args[i].startsWith("-")) i += args[i] === "--workdir" ? 2 : 1
    const name = args[i]
    const rest = args.slice(i + 1)
    if (!exists(name)) fail(`Error: No such container: ${name}`)
    const input = await stdin()
    if (rest[0] === "sh") {
      // writeFile
      fs.writeFileSync(path.join(cdir(name), "files", path.basename(rest[rest.length - 1])), input)
      break
    }
    if (input.includes("#SLEEP")) await new Promise((r) => setTimeout(r, 30000))
    if (input.includes("#OOM")) process.exit(137)
    if (input.includes("#FAIL")) fail("Traceback (most recent call last):\nNameError: boom")
    if (input.includes("#BIGOUT")) {
      out("x".repeat(500_000))
      break
    }
    if (input.includes('"/work/out"') && input.includes("b64encode")) {
      out(process.env.FAKE_DOCKER_ARTIFACTS || "[]")
      out("\n")
      break
    }
    out("ran:" + input.length + "\n")
    break
  }
  case "rm": {
    if (process.env.FAKE_DOCKER_RM_FAIL) break // "succeeds" but leaves the container: verification must catch it
    for (const n of args.slice(1).filter((a) => !a.startsWith("-")))
      fs.rmSync(cdir(n), { recursive: true, force: true })
    break
  }
  case "inspect":
    if (exists(args[1])) out("[{}]\n")
    else fail("Error: No such object: " + args[1])
    break
  case "ps":
    if (fs.existsSync(path.join(dir, "c"))) out(fs.readdirSync(path.join(dir, "c")).join("\n") + "\n")
    break
  default:
    fail("fake-docker: unsupported " + args[0])
}

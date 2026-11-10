// CLI — run the analyst without the web UI.
//   pnpm --filter @scudra/analyst cli "average of the numbers 1..100"
//   pnpm --filter @scudra/analyst cli --csv data.csv "average salary per department"
//   pnpm --filter @scudra/analyst cli --probe
//   pnpm --filter @scudra/analyst cli --doctor     (check Docker + image + keys)
//   SCUDRA_MOCK=1 ... works with no Docker and no key.
import { readFileSync } from "node:fs"
import { buildDeps, buildProbeDeps } from "../lib/deps.js"
import { configProblem, loadConfig, signingKeyIsEphemeral } from "../lib/config.js"
import type { AnalystEvent } from "../lib/events.js"
import { runContainmentProbe, runTask } from "../lib/orchestrator.js"
import { getProvider } from "../lib/providers/index.js"

const args = process.argv.slice(2)
const csvIdx = args.indexOf("--csv")
const csv = csvIdx >= 0 ? readFileSync(args.splice(csvIdx, 2)[1]!, "utf8") : undefined
const probe = args.includes("--probe")
const doctor = args.includes("--doctor")
const task = args.filter((a) => !a.startsWith("--")).join(" ")

const print = (e: AnalystEvent) => {
  switch (e.type) {
    case "sandbox":
      console.log(
        `  sandbox  ${e.sandboxId} [${e.provider}] booted in ${e.bootMs}ms  net=${e.limits.network} mem=${e.limits.memoryMb}MB pids=${e.limits.pids}`,
      )
      break
    case "writing":
      console.log(`  attempt ${e.attempt} code:\n${e.code.replace(/^/gm, "    | ")}`)
      break
    case "result":
      console.log(
        `  result   exit=${e.result.exitCode}${e.result.timedOut ? " TIMEOUT" : ""} ${e.result.durationMs}ms\n${e.result.stdout.replace(/^/gm, "    > ")}${e.result.stderr ? e.result.stderr.replace(/^/gm, "    ! ") : ""}`,
      )
      break
    case "retry":
      console.log(`  retry    ${e.reason}`)
      break
    case "artifact":
      console.log(`  artifact ${e.artifact.name} ${e.artifact.bytes}B sha256:${e.artifact.sha256.slice(0, 12)}`)
      break
    case "verdict":
      console.log(`  verdict  ${e.verdict.toUpperCase()} — ${e.reason}`)
      break
    case "answer":
      console.log(`\n  answer: ${e.text}\n`)
      break
    case "probe":
      console.log(
        `  [${e.status === "blocked" ? "BLOCKED" : "ESCAPED"}] ${e.index}/${e.total} ${e.name} — ${e.evidence}`,
      )
      break
    case "teardown":
      console.log(`  teardown ${e.sandboxId} lived ${e.lifetimeMs}ms, verified gone=${e.verified}`)
      break
    case "receipt":
      console.log(`  receipt  ${e.receipt.runId} sig:${e.receipt.signature.slice(0, 16)}…`)
      break
    case "error":
      console.error(`\nError: ${e.message}`)
      process.exitCode = 1
      break
  }
}

if (doctor) {
  const config = loadConfig()
  const checks = await getProvider(config.provider).health(config.spec)
  const problem = process.env.SCUDRA_MOCK === "1" ? null : configProblem(config)
  checks.push({ name: "Config", ok: !problem, detail: problem ?? "inference key and model set" })
  for (const c of checks) console.log(`${c.ok ? "✓" : "✗"} ${c.name}: ${c.detail}`)
  // The receipt key is a warning, not a gate: an ephemeral key still signs
  // and still verifies — but only against a public key that changes on every
  // restart, which no third party can rely on.
  if (signingKeyIsEphemeral()) {
    console.log("! Receipt key: EPHEMERAL — set RECEIPT_SIGNING_KEY so receipts are verifiable by a third party")
  } else {
    console.log(`✓ Receipt key: ${config.receiptKeyId} (Ed25519, public key published)`)
  }
  process.exit(checks.every((c) => c.ok) ? 0 : 1)
} else if (probe) {
  await runContainmentProbe(buildProbeDeps().deps, print)
} else {
  if (!task) {
    console.error('Usage: cli [--csv file] "task"  |  cli --probe  |  cli --doctor')
    process.exit(1)
  }
  const built = buildDeps()
  if ("problem" in built) {
    console.error(built.problem)
    process.exit(1)
  }
  await runTask(built.deps, { task, csv }, print)
}

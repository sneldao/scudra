// GET /api/health → readiness of every dependency. Never reveals secrets, only
// whether they are set. The UI uses this to show the system state honestly.
import type { APIRoute } from "astro"
import { getGate } from "../../lib/deps.js"
import { configProblem, loadConfig } from "../../lib/config.js"
import { getProvider } from "../../lib/providers/index.js"

export const GET: APIRoute = async () => {
  const config = loadConfig()
  const mock = process.env.SCUDRA_MOCK === "1"
  const checks = await getProvider(config.provider)
    .health(config.spec)
    .catch((e) => [{ name: "Sandbox provider", ok: false, detail: String(e.message ?? e) }])
  const problem = mock ? null : configProblem(config)
  checks.push({
    name: "Vultr Serverless Inference",
    ok: mock || !problem,
    detail: mock ? "mocked" : (problem ?? config.inferenceModel),
  })
  const gate = getGate(config.maxConcurrent)
  return new Response(
    JSON.stringify({
      ok: checks.every((c) => c.ok),
      mock,
      provider: mock ? "mock" : config.provider,
      model: mock ? "mock-model" : config.inferenceModel,
      capacity: { active: gate.active, max: config.maxConcurrent },
      limits: {
        memoryMb: config.spec.memoryMb,
        cpus: config.spec.cpus,
        pids: config.spec.pids,
        execTimeoutMs: config.spec.execTimeoutMs,
      },
      checks,
    }),
    { headers: { "content-type": "application/json", "cache-control": "no-store" } },
  )
}

import { configProblem, loadConfig, type Config } from "./config.js"
import type { Deps } from "./orchestrator.js"
import { vultrLlm } from "./llm.js"
import { mockLlm } from "./mock.js"
import { createGate, type Gate } from "./limiter.js"
import { getProvider } from "./providers/index.js"

// One gate per process: bounds concurrent sandboxes on this VM.
let gate: Gate | undefined
export function getGate(max: number): Gate {
  return (gate ??= createGate(max))
}

export function buildDeps(): { deps: Deps; config: Config } | { problem: string } {
  const config = loadConfig()
  if (process.env.SCUDRA_MOCK === "1") {
    config.inferenceModel ||= "mock-model"
    return { config, deps: { provider: getProvider(config.provider), llm: mockLlm, config } }
  }
  const problem = configProblem(config)
  if (problem) return { problem }
  const llmOpts = { baseUrl: config.inferenceBaseUrl, apiKey: config.inferenceKey }
  return {
    config,
    deps: {
      provider: getProvider(config.provider),
      llm: vultrLlm({ ...llmOpts, model: config.inferenceModel }),
      verifyLlm: config.inferenceVerifyModel ? vultrLlm({ ...llmOpts, model: config.inferenceVerifyModel }) : undefined,
      config,
    },
  }
}

/** Probe mode needs no LLM key — the receipt keys are already handled by loadConfig. */
export function buildProbeDeps(): { deps: Deps; config: Config } {
  const config = loadConfig()
  return {
    config,
    deps: { provider: getProvider(config.provider), llm: async () => "", config },
  }
}

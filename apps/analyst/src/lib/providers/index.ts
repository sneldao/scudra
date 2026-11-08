import { DockerProvider } from "./docker.js"
import { mockProvider } from "../mock.js"
import type { SandboxProvider } from "./types.js"

/**
 * Provider registry. `docker` (on the Vultr VM) is the default and the only
 * real one used in the submitted demo. Others implement the same lifecycle
 * contract in providers/types.ts; add them here. `mock` is dev-only.
 */
export function getProvider(name: string): SandboxProvider {
  if (process.env.SCUDRA_MOCK === "1") return mockProvider
  switch (name) {
    case "docker":
      return new DockerProvider()
    default:
      throw new Error(`Unknown SANDBOX_PROVIDER "${name}". Available: docker.`)
  }
}

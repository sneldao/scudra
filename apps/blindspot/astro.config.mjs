import { defineConfig } from "astro/config"
import react from "@astrojs/react"
import node from "@astrojs/node"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  server: {
    port: 4567,
  },
  integrations: [react()],
  output: "server",
  adapter: node({ mode: "standalone" }),
  vite: {
    resolve: {
      alias: {
        "@scudra/evidence": path.resolve(__dirname, "../../packages/evidence/src"),
      },
    },
  },
  // Keep every dependency (incl. the Solari SDKs and ethers) externalized in
  // the SSR build — the vite default. Force-bundling @solarisdk/browser drags
  // patchright-core into the bundle, whose lazy `require("fsevents")` (a
  // native binary) breaks the build, and pnpm's strict layout cannot resolve
  // patchright-core from dist/ at runtime either. Externalized imports
  // resolve normally in the standalone Node server.
})

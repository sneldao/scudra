import { defineConfig } from "astro/config"
import react from "@astrojs/react"
import node from "@astrojs/node"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  server: {
    port: 4570,
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
})

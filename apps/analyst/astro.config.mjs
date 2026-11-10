import { defineConfig } from "astro/config"
import react from "@astrojs/react"
import node from "@astrojs/node"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The public hostname this app is served on.
const publicHost = process.env.PUBLIC_HOST ?? "analyst.149.248.9.254.sslip.io"

export default defineConfig({
  server: {
    port: 4570,
  },
  integrations: [react()],
  output: "server",
  adapter: node({ mode: "standalone" }),
  security: {
    // Same reason as Blindspot: Astro only honours the forwarded protocol and
    // host when allowedDomains is configured, and without it a TLS-terminating
    // proxy makes every non-GET request look cross-site. The patterns double
    // as a host-header-injection guard.
    allowedDomains: [{ hostname: publicHost, protocol: "https" }, { hostname: "localhost" }, { hostname: "127.0.0.1" }],
  },
  vite: {
    resolve: {
      alias: {
        "@scudra/evidence": path.resolve(__dirname, "../../packages/evidence/src"),
      },
    },
  },
})

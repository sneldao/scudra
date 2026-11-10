import { defineConfig } from "astro/config"
import react from "@astrojs/react"
import node from "@astrojs/node"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The public hostname this app is served on. Used for Astro's
// security.allowedDomains — see the comment on the security block below.
const publicHost = process.env.PUBLIC_HOST ?? "scudra.persidian.com"

export default defineConfig({
  server: {
    port: 4567,
  },
  integrations: [react()],
  output: "server",
  adapter: node({ mode: "standalone" }),
  security: {
    // Astro's CSRF origin check compares the browser's Origin header against
    // the request's own origin. Behind a TLS-terminating proxy the upstream
    // connection is plain http, so Astro would see
    // http://scudra.persidian.com and reject the browser's real
    // https://scudra.persidian.com as cross-site — which made the DELETE
    // endpoint unreachable: the delete button never worked.
    //
    // Astro only honours X-Forwarded-Proto when allowedDomains is
    // configured. With it set, the forwarded protocol and host are validated
    // against these patterns and used for the origin comparison.
    //
    // The patterns are also a host-header-injection guard: a request whose
    // X-Forwarded-Host matches none of them has that header ignored, and the
    // request's own host is used instead.
    allowedDomains: [
      { hostname: publicHost, protocol: "https" },
      { hostname: "localhost" },
      { hostname: "127.0.0.1" },
    ],
  },
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

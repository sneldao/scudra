import { defineConfig } from "astro/config"
import react from "@astrojs/react"
import node from "@astrojs/node"

export default defineConfig({
  server: {
    port: 4570,
  },
  integrations: [react()],
  output: "server",
  adapter: node({ mode: "standalone" }),
})

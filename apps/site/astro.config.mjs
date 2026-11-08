import { defineConfig } from "astro/config"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  site: "https://github.com/sneldao/scudra",
  // Astro 7's Rust compiler no longer compresses whitespace between inline
  // elements. Opt into the old behavior so the type-driven nav/footer and
  // label spacing keep their v5 rendering.
  compressHTML: true,
  server: {
    port: 4321,
  },
  vite: {
    resolve: {
      alias: {
        "@scudra/shared": path.resolve(__dirname, "../../packages/shared/src"),
      },
    },
  },
})

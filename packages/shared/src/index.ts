export const SITE = {
  name: "Scudra",
  tagline: "A lab for cloud-native agents.",
  description:
    "Recipes, experiences, and thought leadership for browsers, sandboxes, and desktops that run in the cloud.",
  url: "https://github.com/sneldao/scudra",
  github: "https://github.com/sneldao/scudra",
} as const

/**
 * The deployment.
 *
 * The lab (this site) is the top of the funnel; Blindspot is the thing people
 * actually use. The URLs live in one place so a redeploy is a one-line change
 * rather than a hunt through pages.
 *
 * The lab artifacts are addressed by their own hostnames so they can never be
 * mistaken for the product. The sslip.io hosts are the pragmatic bridge while
 * the Cloudflare wildcard records for persidian.com do not exist yet: sslip.io
 * resolves any label to the IP in its name and Let's Encrypt issues for it.
 */
export const DEPLOY = {
  product: { name: "Blindspot", url: "https://scudra.persidian.com" },
  analyst: { name: "The Analyst", url: "https://analyst.149.248.9.254.sslip.io" },
  lab: { name: "The lab", url: "https://lab.149.248.9.254.sslip.io" },
} as const

export const PRODUCT = {
  name: "Blindspot",
  url: "https://scudra.persidian.com",
  tagline: "Evidence gathering that leaves the investigator invisible.",
} as const

export const NAV = [
  { label: "Manifesto", href: "/manifesto" },
  { label: "Recipes", href: "/recipes" },
  { label: "Experiences", href: "/experiences" },
] as const

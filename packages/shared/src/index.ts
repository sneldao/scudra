export const SITE = {
  name: "Scudra",
  tagline: "A lab for cloud-native agents.",
  description:
    "Recipes, experiences, and thought leadership for browsers, sandboxes, and desktops that run in the cloud.",
  url: "https://github.com/sneldao/scudra",
  github: "https://github.com/sneldao/scudra",
} as const

/**
 * The product deployment.
 *
 * The lab (this site) is the top of the funnel; Blindspot is the thing people
 * actually use. The URL lives in one place so a redeploy is a one-line
 * change rather than a hunt through pages.
 */
export const PRODUCT = {
  name: "Blindspot",
  url: "https://blindspot.persidian.com",
  tagline: "Evidence gathering that leaves the investigator invisible.",
} as const

export const NAV = [
  { label: "Manifesto", href: "/manifesto" },
  { label: "Recipes", href: "/recipes" },
  { label: "Experiences", href: "/experiences" },
] as const

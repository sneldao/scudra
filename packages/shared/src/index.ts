export const SITE = {
  name: "Scudra",
  tagline: "A lab for cloud-native agents.",
  description:
    "Recipes, experiences, and thought leadership for browsers, sandboxes, and desktops that run in the cloud.",
  url: "https://scudra.dev",
  github: "https://github.com/scudra/scudra",
} as const

export const NAV = [
  { label: "Manifesto", href: "/manifesto" },
  { label: "Recipes", href: "/recipes" },
  { label: "Experiences", href: "/experiences" },
] as const

// Live interactive experience routes. The experience apps (apps/blindspot,
// apps/witness, apps/builder) are deployed separately from the marketing
// site; point these at their public URLs via PUBLIC_* env vars so the site's
// CTAs lead straight into the interactive experiences. Until a URL is set,
// they fall back to the closest static surface on the site.
function envUrl(key: string): string | undefined {
  return (import.meta as { env?: Record<string, string | undefined> }).env?.[key]
}

export const EXPERIENCE_URLS = {
  blindspot: envUrl("PUBLIC_BLINDSPOT_URL") || "/experiences/blindspot",
  witness: envUrl("PUBLIC_WITNESS_URL") || "/recipes/stealth-scraper",
  builder: envUrl("PUBLIC_BUILDER_URL") || "/recipes/the-builder",
} as const

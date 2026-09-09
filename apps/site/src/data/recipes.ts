export interface Recipe {
  slug: string
  title: string
  tagline: string
  description: string
  primitives: Array<"browser" | "sandbox" | "desktop">
  status: "live" | "cooking" | "planned"
  source?: string
  demo?: string
}

export const recipes: Recipe[] = [
  {
    slug: "blindspot",
    title: "Blindspot",
    tagline: "Privacy-preserving onchain investigation.",
    description:
      "Look up an ENS name and watch an agent quietly investigate it — resolving the wallet, checking onchain holdings, and digging up off-chain context — then hand you a verdict. It does all of it from a disposable cloud machine that vanishes when you're done.",
    primitives: ["browser", "sandbox"],
    status: "live",
    source: "apps/blindspot",
    demo: "/experiences/blindspot",
  },
  {
    slug: "stealth-scraper",
    title: "The Witness",
    tagline: "The same URL, seen from three countries at once.",
    description:
      "Enter a URL and watch three stealth browsers visit it from different countries through residential IPs. Compare what each location sees — prices, currency, content — and collect evidence without leaving fingerprints.",
    primitives: ["browser"],
    status: "cooking",
    source: "apps/witness",
  },
  {
    slug: "code-interpreter",
    title: "Code Interpreter — The Analyst",
    tagline: "Run untrusted code in an ephemeral sandbox.",
    description:
      "Spawn a sandbox, execute Python or shell code, and return the result. The VM is destroyed after the task, so failed or malicious code cannot persist.",
    primitives: ["sandbox"],
    status: "cooking",
    source: "examples/sandbox-code-interpreter-py",
  },
  {
    slug: "desktop-operator",
    title: "Desktop Operator — The Controller",
    tagline: "Operate a remote GUI with vision and clicks.",
    description:
      "Use a cloud desktop to interact with applications that require a screen. Take screenshots, click, type, and observe like a human operator.",
    primitives: ["desktop"],
    status: "planned",
    source: "examples/desktop-computer-use-py",
  },
  {
    slug: "browser-profiles",
    title: "Browser Profiles — The Chameleon",
    tagline: "Wear an identity, shed it, prove that nothing followed you.",
    description:
      "Run tasks under a persistent browser profile, then contrast it with an ephemeral session. A live fingerprint audit shows exactly what follows you — and what vanishes.",
    primitives: ["browser"],
    status: "planned",
    source: "examples/browser-profiles-ts",
  },
  {
    slug: "the-archivist",
    title: "Session Recording — The Archivist",
    tagline: "A flight recorder for agents.",
    description:
      "Run a cloud-browser agent through a real task while session recording captures everything. Scrub the replay of every page seen and every decision made — then the session is destroyed.",
    primitives: ["browser"],
    status: "planned",
    source: "examples/browser-session-recording-py",
  },
  {
    slug: "the-builder",
    title: "The Builder",
    tagline: "Prompt. Boot. Build. Vanish.",
    description:
      "Describe a small app and watch an agent plan it, write it, and boot it in a disposable sandbox — then hand you a live URL that dies with the machine that hosted it.",
    primitives: ["sandbox"],
    status: "cooking",
    source: "apps/builder",
  },
]

export function getRecipe(slug: string): Recipe | undefined {
  return recipes.find((r) => r.slug === slug)
}

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
    title: "Blindspot — The Investigator",
    tagline: "Privacy-preserving onchain investigation.",
    description:
      "Resolve an ENS name, run Mobula inside an ephemeral sandbox, enrich off-chain context through a stealth browser, and deliver a verdict. The investigator's identity, traffic, and history are protected.",
    primitives: ["browser", "sandbox"],
    status: "live",
    source: "apps/blindspot",
    demo: "/experiences/blindspot",
  },
  {
    slug: "stealth-scraper",
    title: "Stealth Scraper — The Witness",
    tagline: "Collect evidence from the web without leaving fingerprints.",
    description:
      "Use a cloud browser with a residential proxy to scrape pages from different egress points. Capture screenshots and structured data without revealing the operator.",
    primitives: ["browser"],
    status: "cooking",
    source: "apps/witness",
  },
  {
    slug: "code-interpreter",
    title: "Code Interpreter — The Analyst",
    tagline: "Run untrusted code in an ephemeral sandbox.",
    description:
      "An LLM on Vultr Serverless Inference writes code that runs in a locked-down Docker sandbox on a Vultr VM — no network, no secrets, verified teardown, signed receipts, and a semantic verifier pass. Built for the Vultr Agent Rush hackathon.",
    primitives: ["sandbox"],
    status: "live",
    source: "apps/analyst",
    demo: "https://149.248.9.254.sslip.io",
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
    title: "Sandbox Preview — The Builder",
    tagline: "Prompt. Boot. Build. Vanish.",
    description:
      "An agent writes an application and boots it inside a sandbox with a live preview URL. Interact with software born on stage, then watch the sandbox — and the software — be destroyed.",
    primitives: ["sandbox"],
    status: "live",
    source: "apps/builder",
    demo: "/experiences/builder",
  },
]

export function getRecipe(slug: string): Recipe | undefined {
  return recipes.find((r) => r.slug === slug)
}

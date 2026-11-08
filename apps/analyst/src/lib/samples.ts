// Built-in datasets so the product is useful in one click, no upload needed.
// Deterministic (seeded) so demos are repeatable.

export interface Sample {
  id: string
  label: string
  blurb: string
  csv: string
  prompts: string[]
}

function rng(seed: number) {
  let s = seed
  return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296
}

function salaries(): string {
  const rows = [
    ["Ada", "Engineering", 148, 9],
    ["Lin", "Engineering", 132, 6],
    ["Omar", "Engineering", 119, 3],
    ["Priya", "Engineering", 156, 11],
    ["Mo", "Operations", 82, 4],
    ["Sue", "Operations", 91, 7],
    ["Kai", "Operations", 76, 2],
    ["Ted", "Sales", 71, 3],
    ["Ines", "Sales", 94, 8],
    ["Raj", "Sales", 88, 5],
    ["Zoe", "Design", 112, 6],
    ["Leo", "Design", 99, 3],
  ]
  return "name,department,salary_k,years\n" + rows.map((r) => r.join(",")).join("\n") + "\n"
}

function sales(): string {
  const r = rng(7)
  const months = [
    "2025-01",
    "2025-02",
    "2025-03",
    "2025-04",
    "2025-05",
    "2025-06",
    "2025-07",
    "2025-08",
    "2025-09",
    "2025-10",
    "2025-11",
    "2025-12",
  ]
  const regions: [string, number][] = [
    ["EMEA", 120],
    ["Americas", 180],
    ["APAC", 90],
  ]
  const out = ["month,region,revenue_k,units"]
  months.forEach((m, i) => {
    for (const [reg, base] of regions) {
      const rev = Math.round(base * (1 + i * 0.045) * (0.88 + r() * 0.24))
      out.push(`${m},${reg},${rev},${Math.round(rev / (2.1 + r() * 0.6))}`)
    }
  })
  return out.join("\n") + "\n"
}

function tickets(): string {
  const r = rng(42)
  const cats = ["Billing", "Login", "Bug", "Feature request", "Performance"]
  const prios = ["low", "medium", "high"]
  const out = ["ticket_id,category,priority,hours_to_resolve,csat"]
  for (let i = 1; i <= 40; i++) {
    const c = cats[Math.floor(r() * cats.length)]!
    const p = prios[Math.floor(r() * 3)]!
    const base = c === "Bug" ? 30 : c === "Performance" ? 22 : 8
    const h = Math.max(1, Math.round(base * (0.4 + r() * 1.4) * (p === "high" ? 0.6 : 1)))
    const csat = Math.max(1, Math.min(5, Math.round(5 - h / 18 + (r() - 0.5) * 1.6)))
    out.push(`T-${1000 + i},${c},${p},${h},${csat}`)
  }
  return out.join("\n") + "\n"
}

export const SAMPLES: Sample[] = [
  {
    id: "salaries",
    label: "Team salaries",
    blurb: "12 people · department, salary, tenure",
    csv: salaries(),
    prompts: [
      "Chart average salary by department and call out the gap",
      "Is there a relationship between years of experience and salary?",
      "Who is paid more than 1.2× their department average?",
    ],
  },
  {
    id: "sales",
    label: "Monthly sales",
    blurb: "36 rows · 3 regions × 12 months",
    csv: sales(),
    prompts: [
      "Plot monthly revenue by region as a line chart",
      "Which region grew fastest from January to December?",
      "What was the best month overall, and how much of it came from each region?",
    ],
  },
  {
    id: "tickets",
    label: "Support tickets",
    blurb: "40 tickets · category, priority, CSAT",
    csv: tickets(),
    prompts: [
      "Which category takes longest to resolve? Chart it.",
      "Does resolution time affect CSAT?",
      "Summarise tickets by priority with average hours and CSAT",
    ],
  },
]

export const NO_DATA_PROMPTS = [
  "What is the sum of the squares of 1 to 100? Show your working",
  "Find the first 10 primes above 1000 and plot their gaps",
]

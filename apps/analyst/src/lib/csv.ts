// Minimal, dependency-free CSV preview for the UI (quote-aware). The sandbox
// does the real parsing with pandas; this only previews and sanity-checks.

export function parseCsvPreview(csv: string, maxRows = 6): { header: string[]; rows: string[][]; totalRows: number } {
  const lines = csv
    .replace(/\r/g, "")
    .split("\n")
    .filter((l) => l.length > 0)
  const split = (line: string): string[] => {
    const out: string[] = []
    let cur = ""
    let q = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]!
      if (c === '"') {
        if (q && line[i + 1] === '"') {
          cur += '"'
          i++
        } else q = !q
      } else if (c === "," && !q) {
        out.push(cur)
        cur = ""
      } else cur += c
    }
    out.push(cur)
    return out
  }
  const [h, ...rest] = lines
  return { header: h ? split(h) : [], rows: rest.slice(0, maxRows).map(split), totalRows: rest.length }
}

export function checkCsv(text: string, maxBytes = 100_000): string | null {
  if (!text.trim()) return "That file is empty."
  if (text.length > maxBytes)
    return `That file is ${Math.round(text.length / 1000)} KB — the demo limit is ${maxBytes / 1000} KB.`
  const first = text.split("\n", 1)[0] ?? ""
  if (!first.includes(",")) return "This does not look like a comma-separated file."
  return null
}

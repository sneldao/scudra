// GET /api/cases/[id]/export — the case as a file the user can keep.
//
// Two formats, because the user is doing two different things with it:
//   .json — for a tool, a script, another agent, or an archive
//   .html  — for a person: a readable report they can send to someone
//
// THE TWO AUDIENCES.
//
// A case contains two kinds of document and they are NOT equally shareable:
//
//   The RECEIPT is publishable. It is signed, and anyone holding the
//   published public key can verify it without trusting us. That is the
//   whole point of it — it is meant to be handed to a bounty board, a
//   journalist, a regulator.
//
//   The CASE MATERIAL is private. The findings, the signals, the source
//   excerpts: these are the user's working file about a subject, and
//   publishing them is the user's decision, not the tool's.
//
// So the export separates them explicitly, with a `shareable` block that
// says what can be handed over and what cannot. The export is the user's
// document; the tool's job is to make the distinction legible, not to make
// the decision for them.
//
// OWNER-SCOPED: you can only export your own case.

import type { APIRoute } from "astro"
import { getCaseStore } from "../../../../server/store-singleton.js"
import { requestOwner } from "../../../../server/request-owner.js"
import type { StoredCase } from "../../../../lib/store.js"

export const GET: APIRoute = async ({ params, url, cookies }) => {
  const owner = requestOwner(cookies, url)
  const store = getCaseStore()
  if (!store) return json({ error: "Case storage is unavailable on this server." }, 503)
  const id = params.id
  if (!id) return json({ error: "Missing case id." }, 400)

  const c = store.getForOwner(id, owner.hash)
  if (!c) return json({ error: "No such case." }, 404)

  const format = url.searchParams.get("format") ?? "json"
  const stamp = new Date(c.createdAt).toISOString().slice(0, 10)
  const filename = `blindspot-${c.ensName.replace(/\./g, "-")}-${stamp}`

  if (format === "html") {
    return new Response(renderHtml(c), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}.html"`,
      },
    })
  }

  return new Response(
    JSON.stringify(
      {
        version: 1,
        exportedAt: new Date().toISOString(),
        case: c,
        shareable: {
          audience: "publishable",
          receipt: c.receipt,
          note: "The receipt is signed with Ed25519 and the public key is published, so anyone can verify it without trusting us. The case material above is NOT publishable by default — it is what you found, and sharing it is your call.",
        },
      },
      null,
      2,
    ),
    {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}.json"`,
      },
    },
  )
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function renderHtml(c: StoredCase): string {
  const signals = c.signals
    .map(
      (s) =>
        `<tr><td>${esc(s.category)}</td><td><strong>${esc(s.label)}</strong></td><td class="sev ${esc(s.severity)}">${esc(s.severity)}</td><td>${esc(s.detail)}</td><td class="mono">${s.sources.map(esc).join(", ") || "—"}</td></tr>`,
    )
    .join("\n")
  const sources = c.sources
    .map(
      (s) =>
        `<tr><td class="mono">${esc(s.id)}</td><td>${esc(s.kind)}</td><td>${esc(s.ref)}</td><td>${esc(s.title)}</td><td>${esc(s.excerpt)}</td></tr>`,
    )
    .join("\n")

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Blindspot case — ${esc(c.ensName)}</title>
<style>
  body{font-family:-apple-system,'Segoe UI',system-ui,sans-serif;line-height:1.6;max-width:900px;margin:0 auto;padding:2rem;color:#16161d}
  h1{font-size:1.6rem;margin:0 0 .25rem}
  h2{font-size:1.05rem;margin:2rem 0 .5rem;text-transform:uppercase;letter-spacing:.08em;color:#666}
  .meta{color:#666;font-size:.85rem}
  .score{font-size:2.4rem;font-weight:700}
  table{width:100%;border-collapse:collapse;font-size:.85rem}
  th{text-align:left;color:#666;border-bottom:1px solid #ddd;padding:.4rem}
  td{padding:.45rem;border-bottom:1px solid #eee;vertical-align:top}
  .mono{font-family:ui-monospace,Menlo,monospace;font-size:.78rem}
  .sev.high{color:#b3261e}.sev.medium{color:#a8620a}.sev.low{color:#1a7f37}
  pre{background:#f6f6f4;padding:1rem;border-radius:6px;overflow:auto;font-size:.75rem}
  .shareable{border:2px solid #1a7f37;background:#f2fbf5;padding:1rem 1.25rem;border-radius:8px}
  .private{border-left:3px solid #b3261e;padding-left:1rem}
</style></head><body>
<h1>${esc(c.ensName)}</h1>
<p class="meta mono">${esc(c.address)}</p>
<p class="meta">Investigated ${esc(c.createdAt)} · case <span class="mono">${esc(c.id)}</span></p>

<h2>Verdict</h2>
<p><span class="score">${c.riskScore}</span>/100 — <strong>${esc(c.riskLabel)}</strong></p>
<p>${esc(c.summary)}</p>
<p class="meta">${c.signals.length} signal(s) · ${(c.durationMs / 1000).toFixed(1)}s · ${(c.costUsdCents / 100).toFixed(2)} USD</p>

<div class="shareable">
  <h2>Shareable — the signed receipt</h2>
  <p>This block is publishable. It is signed with Ed25519 and the public key is published, so anyone can verify it without trusting us.</p>
  <pre>${esc(JSON.stringify(c.receipt, null, 2))}</pre>
</div>

<div class="private">
  <h2>Private by default — the findings</h2>
  <p>The material below is what you found. Sharing it is your call, not the tool's.</p>
</div>

<h2>Signals</h2>
<table><thead><tr><th>Category</th><th>Signal</th><th>Severity</th><th>Detail</th><th>Sources</th></tr></thead><tbody>${signals}</tbody></table>

<h2>Sources</h2>
<table><thead><tr><th>Id</th><th>Kind</th><th>Ref</th><th>Title</th><th>Excerpt</th></tr></thead><tbody>${sources}</tbody></table>
</body></html>`
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

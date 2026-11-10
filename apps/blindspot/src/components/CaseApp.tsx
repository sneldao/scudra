// CaseApp — the product surface.
//
// The 3D dossier in /dossier is the lab's language: a beautiful thing that
// shows what the technology can do. This page is the product's language: one
// field, one button, one result, and the things a paying user needs around
// it — their history, the cost, the receipt, the export, and a way to tell
// us we were wrong.
//
// The deliberate choices:
//   • ONE input. No sample datasets in the primary path, no suggested
//     prompts. A user who knows what they want should not have to read our
//     examples first.
//   • The verdict is the headline, not the animation.
//   • Cost is visible. An investigator has to budget, and hiding the cost
//     hides the decision.
//   • Feedback is one click. It is the only research loop that works, and
//     it is worthless if it takes more than one click.

import { useCallback, useEffect, useState } from "react"
import type { InvestigationEvent } from "../lib/events.js"

interface StoredCase {
  id: string
  ensName: string
  address: string
  createdAt: string
  rawExpiresAt: string
  riskScore: number
  riskLabel: string
  summary: string
  signals: { category: string; label: string; severity: string; detail: string; sources: string[] }[]
  sources: { id: string; kind: string; ref: string; title: string; excerpt: string }[]
  costUsdCents: number
  durationMs: number
  receipt: { grounding?: { checked: number; grounded: number; ungrounded: string[] }; signedBy?: { keyId?: string } }
  feedback: "wrong" | "incomplete" | "right" | null
}

type Phase = "idle" | "running" | "done" | "error"

const PHASE_STEPS: { key: string; label: string }[] = [
  { key: "resolving", label: "Resolve the ENS name" },
  { key: "sandbox", label: "Boot the ephemeral sandbox" },
  { key: "proxy", label: "Route through a residential proxy" },
  { key: "onchain", label: "Pull the onchain portfolio" },
  { key: "offchain", label: "Enrich the off-chain context" },
  { key: "analyzing", label: "Assess risk and sign the receipt" },
]

export default function CaseApp() {
  const [phase, setPhase] = useState<Phase>("idle")
  const [name, setName] = useState("")
  const [step, setStep] = useState(-1)
  const [errorText, setErrorText] = useState("")
  const [current, setCurrent] = useState<StoredCase | null>(null)
  const [cases, setCases] = useState<StoredCase[]>([])
  const [storeAvailable, setStoreAvailable] = useState(true)
  const [verifying, setVerifying] = useState<null | boolean>(null)
  const [savingFeedback, setSavingFeedback] = useState(false)

  const refreshCases = useCallback(async () => {
    try {
      const res = await fetch("/api/cases?limit=10")
      if (!res.ok) {
        setStoreAvailable(false)
        return
      }
      const body = await res.json()
      setCases(body.cases ?? [])
      setStoreAvailable(true)
    } catch {
      setStoreAvailable(false)
    }
  }, [])

  useEffect(() => {
    void refreshCases()
  }, [refreshCases])

  const run = useCallback(
    (ensName: string) => {
      const target = ensName.trim()
      if (!target) return
      setPhase("running")
      setStep(0)
      setErrorText("")
      setCurrent(null)
      setVerifying(null)

      const es = new EventSource(`/api/investigate?name=${encodeURIComponent(target)}`)
      let closed = false

      es.onmessage = (e) => {
        let event: InvestigationEvent
        try {
          event = JSON.parse(e.data)
        } catch {
          return
        }
        if (event.type === "phase") {
          const idx = PHASE_STEPS.findIndex((s) => s.key === event.phase)
          if (idx >= 0) setStep(idx)
        } else if (event.type === "error") {
          closed = true
          es.close()
          setPhase("error")
          setErrorText(event.message)
        } else if (event.type === "complete") {
          closed = true
          es.close()
          setPhase("done")
          setStep(PHASE_STEPS.length)
          // The case id comes back with the run; fetch the full record so we
          // can show the signals, the sources and the receipt.
          if (event.report.caseId) {
            void fetch(`/api/cases/${event.report.caseId}`)
              .then((r) => (r.ok ? r.json() : null))
              .then((body) => {
                if (body?.case) setCurrent(body.case)
                void refreshCases()
              })
              .catch(() => undefined)
          }
        }
      }

      es.onerror = () => {
        if (closed) return
        closed = true
        es.close()
        setPhase("error")
        setErrorText("The investigation stream ended unexpectedly. Try again in a moment.")
      }
    },
    [refreshCases],
  )

  const verify = useCallback(async () => {
    if (!current) return
    setVerifying(null)
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receipt: current.receipt }),
      })
      const body = await res.json()
      setVerifying(body.valid === true)
    } catch {
      setVerifying(false)
    }
  }, [current])

  const sendFeedback = useCallback(
    async (verdict: "wrong" | "incomplete" | "right") => {
      if (!current) return
      setSavingFeedback(true)
      try {
        await fetch(`/api/cases/${current.id}/feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ verdict }),
        })
        setCurrent({ ...current, feedback: verdict })
        void refreshCases()
      } catch {
        /* the note is the valuable part; the click still counted */
      } finally {
        setSavingFeedback(false)
      }
    },
    [current, refreshCases],
  )

  const removeCase = useCallback(
    async (id: string) => {
      await fetch(`/api/cases/${id}`, { method: "DELETE" }).catch(() => undefined)
      if (current?.id === id) setCurrent(null)
      void refreshCases()
    },
    [current, refreshCases],
  )

  return (
    <div className="shell">
      <header className="masthead">
        <p className="eyebrow">Blindspot</p>
        <h1>Evidence gathering that leaves the investigator invisible.</h1>
        <p className="lede">
          A subject&rsquo;s onchain and off-chain footprint, assembled in throwaway infrastructure that is gone before
          anyone can correlate it &mdash; with a signed record of what was found and what was checked.
        </p>
        <form
          className="search"
          onSubmit={(e) => {
            e.preventDefault()
            run(name)
          }}
        >
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="vitalik.eth"
            aria-label="ENS name to investigate"
            autoComplete="off"
            spellCheck={false}
            disabled={phase === "running"}
          />
          <button type="submit" disabled={phase === "running" || !name.trim()}>
            {phase === "running" ? "Investigating…" : "Investigate"}
          </button>
        </form>
        <p className="hint">
          One ENS name. The sandbox and the browser are destroyed when the run ends; the finding is yours to keep.
        </p>
      </header>

      {phase === "running" && (
        <ol className="steps" aria-live="polite">
          {PHASE_STEPS.map((s, i) => (
            <li key={s.key} className={i < step ? "done" : i === step ? "active" : ""}>
              <span className="tick">{i < step ? "✓" : i === step ? "•" : " "}</span>
              {s.label}
            </li>
          ))}
        </ol>
      )}

      {phase === "error" && (
        <p className="error" role="alert">
          {errorText}
        </p>
      )}

      {current && (
        <Verdict
          caseData={current}
          verifying={verifying}
          onVerify={verify}
          onFeedback={sendFeedback}
          onDelete={() => void removeCase(current.id)}
          busy={savingFeedback}
        />
      )}

      <section className="history">
        <div className="history-head">
          <h2>Your cases</h2>
          <button type="button" className="link" onClick={() => void refreshCases()}>
            Refresh
          </button>
        </div>

        {!storeAvailable && (
          <p className="hint">Case storage is unavailable on this server, so investigations run but are not saved.</p>
        )}

        {storeAvailable && cases.length === 0 && (
          <p className="hint">
            No cases yet. Run an investigation and it will be here &mdash; with its receipt, ready to export.
          </p>
        )}

        <ul className="case-list">
          {cases.map((c) => (
            <li key={c.id}>
              <button type="button" className="case-row" onClick={() => setCurrent(c)}>
                <span className={`score score-${c.riskScore >= 60 ? "high" : c.riskScore >= 30 ? "mid" : "low"}`}>
                  {c.riskScore}
                </span>
                <span className="case-name">{c.ensName}</span>
                <span className="case-meta">
                  {new Date(c.createdAt).toLocaleString()} · {(c.durationMs / 1000).toFixed(1)}s ·{" "}
                  {(c.costUsdCents / 100).toFixed(2)} USD
                  {c.feedback ? ` · you said: ${c.feedback}` : ""}
                </span>
              </button>
              <button type="button" className="link danger" onClick={() => void removeCase(c.id)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      </section>

      <footer className="foot">
        <p>
          Raw material about a subject expires on a short TTL; your evidence and its signed receipt do not. Delete a
          case and it is gone.
        </p>
        <p>
          <a href="/dossier">The 3D dossier experience</a> &middot;{" "}
          <a href="https://github.com/sneldao/scudra" rel="noreferrer">
            Source
          </a>
        </p>
      </footer>
    </div>
  )
}

function Verdict({
  caseData,
  verifying,
  onVerify,
  onFeedback,
  onDelete,
  busy,
}: {
  caseData: StoredCase
  verifying: null | boolean
  onVerify: () => void
  onFeedback: (v: "wrong" | "incomplete" | "right") => void
  onDelete: () => void
  busy: boolean
}) {
  const g = caseData.receipt?.grounding
  return (
    <section className="verdict">
      <div className="verdict-head">
        <span
          className={`score big score-${caseData.riskScore >= 60 ? "high" : caseData.riskScore >= 30 ? "mid" : "low"}`}
        >
          {caseData.riskScore}
        </span>
        <div>
          <h2>
            {caseData.ensName} <span className="label">{caseData.riskLabel}</span>
          </h2>
          <p className="mono dim">{caseData.address}</p>
          <p>{caseData.summary}</p>
        </div>
      </div>

      <div className="facts">
        <span>
          <strong>{caseData.signals.length}</strong> signal{caseData.signals.length === 1 ? "" : "s"}
        </span>
        <span>
          <strong>{(caseData.durationMs / 1000).toFixed(1)}s</strong> elapsed
        </span>
        <span>
          <strong>{(caseData.costUsdCents / 100).toFixed(2)} USD</strong> this investigation
        </span>
        <span>
          <strong>{g ? `${g.grounded}/${g.checked}` : "—"}</strong> figures independently confirmed
        </span>
      </div>

      {g && g.ungrounded.length > 0 && (
        <p className="warn">
          {g.ungrounded.length} figure{g.ungrounded.length === 1 ? "" : "s"} could not be confirmed against the records:{" "}
          {g.ungrounded.join(", ")}.
        </p>
      )}

      {caseData.signals.length > 0 && (
        <ul className="signals">
          {caseData.signals.map((s, i) => (
            <li key={i} className={`sev-${s.severity}`}>
              <div className="signal-head">
                <strong>{s.label}</strong>
                <span className="dim">{s.category}</span>
                <span className="sev">{s.severity}</span>
              </div>
              <p>{s.detail}</p>
              {s.sources.length > 0 && <p className="mono dim small">sources: {s.sources.join(", ")}</p>}
            </li>
          ))}
        </ul>
      )}

      <div className="receipt">
        <div className="receipt-head">
          <h3>Signed receipt</h3>
          {caseData.receipt?.signedBy?.keyId && (
            <span className="mono dim small">key {caseData.receipt.signedBy.keyId}</span>
          )}
        </div>
        <p className="hint">
          Ed25519 over the claims and observations. Anyone holding the public key can check it &mdash; you do not have
          to trust us.
        </p>
        <div className="row">
          <button type="button" onClick={onVerify}>
            Verify this receipt
          </button>
          {verifying !== null && (
            <span className={verifying ? "ok" : "bad"}>
              {verifying ? "✓ signature valid, content intact, figures grounded" : "✗ this receipt does not check out"}
            </span>
          )}
        </div>
      </div>

      <div className="actions">
        <a className="button" href={`/api/cases/${caseData.id}/export?format=json`}>
          Export JSON
        </a>
        <a className="button" href={`/api/cases/${caseData.id}/export?format=html`}>
          Export report
        </a>
        <button type="button" className="button ghost" onClick={onDelete}>
          Delete case
        </button>
      </div>

      {caseData.sources.length > 0 && (
        <div className="sources">
          <h3>Sources</h3>
          <ul>
            {caseData.sources.map((s) => (
              <li key={s.id}>
                <span className="mono dim small">{s.id}</span> <strong>{s.title}</strong>{" "}
                <span className="dim small">{s.kind}</span>
                <p className="small dim">{s.excerpt}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="feedback">
        <p>Was this useful?</p>
        <div className="row">
          {(["right", "incomplete", "wrong"] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={caseData.feedback === v ? "chip active" : "chip"}
              disabled={busy}
              onClick={() => onFeedback(v)}
            >
              {v}
            </button>
          ))}
          {caseData.feedback && <span className="ok small">thanks — that goes straight into the roadmap</span>}
        </div>
      </div>
    </section>
  )
}

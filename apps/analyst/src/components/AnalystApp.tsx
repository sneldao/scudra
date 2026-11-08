import { useEffect, useMemo, useReducer, useRef, useState } from "react"
import { streamEvents } from "../lib/client.js"
import { checkCsv, parseCsvPreview } from "../lib/csv.js"
import type { AnalystEvent } from "../lib/events.js"
import { initialRun, reduce, STAGES, stageIndex, statusLine, type RunState } from "../lib/runState.js"
import { NO_DATA_PROMPTS, SAMPLES } from "../lib/samples.js"
import MachinePanel from "./MachinePanel.tsx"
import ProbeBoard from "./ProbeBoard.tsx"
import ReceiptCard from "./ReceiptCard.tsx"
import type { Grounding } from "../lib/grounding.js"

interface Health {
  ok: boolean
  mock: boolean
  provider: string
  model: string
  capacity: { active: number; max: number }
  checks: { name: string; ok: boolean; detail: string }[]
}

type Source = { kind: "sample"; id: string } | { kind: "upload"; name: string; csv: string } | { kind: "none" }

export default function AnalystApp() {
  const [run, dispatch] = useReducer(reduce, initialRun)
  const [health, setHealth] = useState<Health | null>(null)
  const [source, setSource] = useState<Source>({ kind: "sample", id: SAMPLES[0]!.id })
  const [task, setTask] = useState(SAMPLES[0]!.prompts[0]!)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)
  const results = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const settled = run.phase !== "running"
  // Refresh status on load and after each run (capacity changes). NO cleanup
  // here: a cleanup that aborts would kill the *next* run when `settled` flips.
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(null))
  }, [settled])
  // Abort any in-flight stream only on unmount.
  useEffect(() => () => abort.current?.abort(), [])

  const csv = useMemo(() => {
    if (source.kind === "sample") return SAMPLES.find((s) => s.id === source.id)?.csv
    if (source.kind === "upload") return source.csv
    return undefined
  }, [source])
  const preview = useMemo(() => (csv ? parseCsvPreview(csv) : null), [csv])
  const prompts =
    source.kind === "sample"
      ? SAMPLES.find((s) => s.id === source.id)!.prompts
      : source.kind === "none"
        ? NO_DATA_PROMPTS
        : []
  const busy = run.phase === "running"

  async function go(url: string, init: RequestInit) {
    abort.current?.abort()
    const ac = (abort.current = new AbortController())
    const on = (e: AnalystEvent) => dispatch(e)
    on({
      type: "started",
      runId: "pending",
      task: url.includes("probe") ? "Containment probe" : task,
      mode: url.includes("probe") ? "probe" : "task",
    })
    requestAnimationFrame(() => results.current?.scrollIntoView({ behavior: "smooth", block: "start" }))
    try {
      await streamEvents(url, init, on, ac.signal)
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        on({ type: "error", message: "Connection lost. Nothing is left running — try again." })
    }
  }

  function cancel() {
    abort.current?.abort()
    dispatch({ type: "cancelled" })
    setTimeout(
      () =>
        fetch("/api/health")
          .then((r) => r.json())
          .then(setHealth)
          .catch(() => {}),
      2500,
    )
    // The server destroys the container as soon as it sees the disconnect.
  }
  const [copied, setCopied] = useState(false)
  function copyAnswer() {
    if (!run.answer) return
    navigator.clipboard?.writeText(run.answer).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const runTask = () =>
    go("/api/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ task, csv }),
    })
  const attack = () => go("/api/probe", {})

  function onFile(f: File | undefined) {
    if (!f) return
    f.text().then((text) => {
      const problem = checkCsv(text)
      setUploadError(problem)
      if (!problem) {
        setSource({ kind: "upload", name: f.name, csv: text })
        setTask("Summarise this dataset and chart the most interesting pattern")
      }
    })
  }

  const answering = run.mode === "task" && run.phase === "running" && !run.answer

  return (
    <div className="shell">
      <header className="topbar">
        <a className="skip" href="#main">
          Skip to the analyst
        </a>
        <div className="brand">
          Scudra <b>/</b> Analyst
        </div>
        <div className="pills" aria-label="System status">
          <span className="pill">
            <span className={`dot ${health ? (health.ok ? "ok" : "bad") : ""}`} />
            {health ? (health.ok ? "ready" : "degraded") : "checking"}
          </span>
          {health && (
            <span className="pill">
              {health.provider} · {health.model || "no model"}
            </span>
          )}
          {health && (
            <span className="pill">
              {health.capacity.active}/{health.capacity.max} sandboxes
            </span>
          )}
        </div>
      </header>

      <section aria-label="System notices" className="notices">
        {health?.mock && (
          <div className="banner" role="status">
            Mock mode — scripted model and sandbox, no Docker or API key. Real runs happen on the Vultr VM.
          </div>
        )}
        {health && !health.ok && !health.mock && (
          <div className="banner bad" role="alert">
            <b>Not ready:</b>{" "}
            {health.checks
              .filter((c) => !c.ok)
              .map((c) => `${c.name} — ${c.detail}`)
              .join(" · ")}
          </div>
        )}
      </section>

      <section className="hero" aria-label="About">
        <div className="eyebrow">Blast radius zero</div>
        <h1 style={{ marginTop: 14 }}>
          Ask a question about your data. <em>Watch the machine live and die.</em>
        </h1>
        <p>
          A model on Vultr writes the code. It runs in a throwaway sandbox — no network, no secrets, hard limits — and
          you get real output, a chart, and a signed receipt.
        </p>
      </section>

      <div className="grid">
        <main id="main">
          <section className="card" aria-labelledby="s1">
            <div className="step">
              <span className="n">01</span>
              <h2 id="s1">Pick your data</h2>
            </div>
            <div className="datasets">
              {SAMPLES.map((s) => (
                <button
                  key={s.id}
                  className="ds"
                  aria-pressed={source.kind === "sample" && source.id === s.id}
                  disabled={busy}
                  onClick={() => {
                    setSource({ kind: "sample", id: s.id })
                    setTask(s.prompts[0]!)
                    setUploadError(null)
                  }}
                >
                  <b>{s.label}</b>
                  <span>{s.blurb}</span>
                </button>
              ))}
              <button
                className="ds"
                aria-pressed={source.kind === "upload"}
                disabled={busy}
                onClick={() => fileInput.current?.click()}
              >
                <b>{source.kind === "upload" ? source.name.slice(0, 22) : "Upload CSV"}</b>
                <span>{source.kind === "upload" ? "your file · click to replace" : "up to 100 KB"}</span>
              </button>
              <input
                ref={fileInput}
                type="file"
                accept=".csv,text/csv"
                className="sr"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(e) => {
                  onFile(e.target.files?.[0])
                  e.target.value = ""
                }}
              />
              <button
                className="ds"
                aria-pressed={source.kind === "none"}
                disabled={busy}
                onClick={() => {
                  setSource({ kind: "none" })
                  setTask(NO_DATA_PROMPTS[0]!)
                  setUploadError(null)
                }}
              >
                <b>No data</b>
                <span>just compute something</span>
              </button>
            </div>
            {uploadError && (
              <p className="hint" style={{ color: "var(--bad)", marginTop: 8 }}>
                {uploadError}
              </p>
            )}
            {preview && preview.header.length > 0 && (
              <>
                <div className="preview" tabIndex={0} role="region" aria-label="Data preview (scrollable)">
                  <table>
                    <thead>
                      <tr>
                        {preview.header.map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((r, i) => (
                        <tr key={i}>
                          {r.map((c, j) => (
                            <td key={j}>{c}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="preview-note">
                  {preview.totalRows} rows · this file is copied into the sandbox and nowhere else.
                </div>
              </>
            )}
          </section>

          <section className="card" aria-labelledby="s2">
            <div className="step">
              <span className="n">02</span>
              <h2 id="s2">Ask</h2>
            </div>
            <textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              maxLength={500}
              disabled={busy}
              aria-label="Your question"
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !busy && task.trim()) runTask()
              }}
            />
            {prompts.length > 0 && (
              <div className="chips">
                {prompts.map((p) => (
                  <button key={p} className="chip" disabled={busy} onClick={() => setTask(p)}>
                    {p}
                  </button>
                ))}
              </div>
            )}
            <div className="actions">
              {busy ? (
                <button className="btn ghost" onClick={cancel}>
                  Cancel
                </button>
              ) : (
                <>
                  <button className="btn" disabled={!task.trim()} onClick={runTask}>
                    Run in sandbox
                  </button>
                  <button className="btn attack" onClick={attack}>
                    Attack the sandbox ⚡
                  </button>
                </>
              )}
              <span className="hint">⌘↵ to run · the attack needs no AI, only the sandbox</span>
            </div>
          </section>

          <div ref={results} style={{ scrollMarginTop: 16 }} />
          {run.phase !== "idle" && (
            <div className="stack" style={{ marginTop: 16 }}>
              <div className="sr" role="status" aria-live="polite">
                {statusLine(run)}
              </div>
              {run.mode === "task" && <Rail run={run} />}
              {run.phase === "cancelled" && (
                <div className="banner" role="status">
                  Cancelled. The server destroys the container as soon as it notices; the machine panel shows the
                  verified result if it reports back.
                </div>
              )}
              {run.phase === "error" && (
                <div className="banner bad" role="alert">
                  {run.error}
                </div>
              )}

              {run.mode === "probe" && <ProbeBoard run={run} />}

              {run.mode === "task" && (run.answer || run.artifacts.length > 0 || answering) && (
                <section className="card answer" aria-live="polite">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h2 className="eyebrow">Answer</h2>
                    {run.answer && (
                      <button className="btn sm ghost" onClick={copyAnswer}>
                        {copied ? "Copied ✓" : "Copy"}
                      </button>
                    )}
                  </div>
                  {run.answer ? (
                    <>
                      <p style={{ marginTop: 10 }}>{run.answer}</p>
                      <VerdictBadge v={run.verification} />
                      <GroundingBadge g={run.grounding} />
                    </>
                  ) : (
                    <div className="thinking" style={{ marginTop: 10 }}>
                      <span className="dot live" />
                      {statusLine(run)}
                    </div>
                  )}
                  {run.artifacts.map((a) =>
                    a.mime === "image/png" ? (
                      <figure className="figure" key={a.name}>
                        <img src={`data:${a.mime};base64,${a.data}`} alt={`Chart produced by the sandbox: ${a.name}`} />
                        <figcaption>
                          <span>
                            {a.name} · produced inside the sandbox · sha256 {a.sha256.slice(0, 10)}…
                          </span>
                          <a download={a.name} href={`data:${a.mime};base64,${a.data}`}>
                            download
                          </a>
                        </figcaption>
                      </figure>
                    ) : (
                      <figure className="figure" key={a.name}>
                        <figcaption>
                          <span>
                            {a.name} · {a.bytes} B
                          </span>
                          <a download={a.name} href={`data:${a.mime};base64,${a.data}`}>
                            download
                          </a>
                        </figcaption>
                      </figure>
                    ),
                  )}
                </section>
              )}

              {run.mode === "task" && run.attempts.length > 0 && (
                <details className="card trace" open={run.phase === "running" || run.attempts.length > 1}>
                  <summary>
                    <h2>How it got there</h2>
                    <span className="hint">
                      {run.attempts.length} attempt{run.attempts.length > 1 ? "s" : ""}
                      {run.attempts.length > 1 ? " · self-repaired" : ""}
                    </span>
                  </summary>
                  {run.attempts.map((a) => {
                    const bad = a.result && (a.result.exitCode !== 0 || a.result.timedOut)
                    return (
                      <div key={a.n} className={`attempt ${a.result ? (bad ? "failed" : "ok") : ""}`}>
                        <h4>Attempt {a.n} · model-written code</h4>
                        <pre>{a.code}</pre>
                        {a.result && (
                          <>
                            <h4 style={{ marginTop: 12 }}>
                              Real output · exit {a.result.exitCode}
                              {a.result.timedOut ? " · timed out" : ""} · {a.result.durationMs} ms
                            </h4>
                            <pre className={bad ? "err" : ""}>
                              {[a.result.stdout, a.result.stderr].filter(Boolean).join("\n") || "(no output)"}
                            </pre>
                          </>
                        )}
                        {a.retryReason && (
                          <div className="repair">↻ Failed — the real error was fed back to the model.</div>
                        )}
                      </div>
                    )
                  })}
                </details>
              )}

              {run.receipt && <ReceiptCard receipt={run.receipt} />}
            </div>
          )}
        </main>

        <MachinePanel run={run} />
      </div>

      <footer className="footer">
        <span>Control plane + sandbox on Vultr Cloud Compute · model via Vultr Serverless Inference</span>
        <span>You were never there.</span>
      </footer>
    </div>
  )
}

function Rail({ run }: { run: Parameters<typeof stageIndex>[0] }) {
  const i = stageIndex(run)
  return (
    <ol className="rail" aria-label="Progress">
      {STAGES.map((label, n) => (
        <li
          key={label}
          className={n < i ? "done" : n === i && run.phase === "running" ? "on" : ""}
          aria-current={n === i && run.phase === "running" ? "step" : undefined}
        >
          {label}
        </li>
      ))}
    </ol>
  )
}

function VerdictBadge({ v }: { v: RunState["verification"] }) {
  if (!v) return null
  const cls = v.verdict === "pass" ? "ok" : v.verdict === "fail" ? "bad" : "warn"
  const label =
    v.verdict === "pass"
      ? "✓ Independent verifier: the output answers the task."
      : v.verdict === "fail"
        ? "⚠ Independent verifier says this does NOT answer the task — check the trace before trusting it."
        : "Verifier could not confirm the result — treat as unverified."
  return (
    <p className={`grounding ${cls}`}>
      {label}
      {v.reason ? ` ${v.reason}` : ""}
    </p>
  )
}

function GroundingBadge({ g }: { g: Grounding | null }) {
  if (!g || g.checked === 0) return null
  const clean = g.ungrounded.length === 0
  return (
    <p className={`grounding ${clean ? "ok" : "warn"}`}>
      {clean
        ? `✓ All ${g.checked} figure${g.checked > 1 ? "s" : ""} in this answer appear in the real output.`
        : `⚠ ${g.ungrounded.length} figure${g.ungrounded.length > 1 ? "s" : ""} (${g.ungrounded.join(", ")}) not found in the real output — treat with care and check the trace below.`}
    </p>
  )
}

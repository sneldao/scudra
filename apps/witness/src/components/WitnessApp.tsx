import { useState, useCallback, useRef } from "react"
import type { EgressLocation, LocationObservation, DiffLine } from "../lib/types.js"

type Phase = "idle" | "running" | "done"

type CardBeat = "launching" | "alibi" | "reading" | "ok" | "failed"

interface State {
  phase: Phase
  url: string
  locations: EgressLocation[]
  observations: Record<string, LocationObservation>
  egress: Record<string, string>
  differences: DiffLine[]
  identical: boolean
  error: string | null
}

const initial: State = {
  phase: "idle",
  url: "",
  locations: [],
  observations: {},
  egress: {},
  differences: [],
  identical: false,
  error: null,
}

const EXAMPLES = [
  "https://www.bbc.com",
  "https://www.netflix.com",
  "https://www.airbnb.com",
  "https://www.spotify.com",
]

export default function WitnessApp() {
  const [state, setState] = useState<State>(initial)
  const [input, setInput] = useState("")
  const esRef = useRef<EventSource | null>(null)

  const observe = useCallback(() => {
    const url = input.trim()
    if (!url) return
    esRef.current?.close()

    setState({ ...initial, phase: "running", url })
    const es = new EventSource(`/api/observe?url=${encodeURIComponent(url)}`)
    esRef.current = es

    es.onmessage = (msg) => {
      const event = JSON.parse(msg.data)
      switch (event.type) {
        case "started":
          setState((s) => ({ ...s, locations: event.locations }))
          break
        case "location:egress":
          setState((s) => ({ ...s, egress: { ...s.egress, [event.code]: event.egressIp } }))
          break
        case "location:done":
          setState((s) => ({
            ...s,
            observations: { ...s.observations, [event.observation.code]: event.observation },
          }))
          break
        case "complete":
          setState((s) => ({
            ...s,
            phase: "done",
            differences: event.differences,
            identical: event.identical,
          }))
          es.close()
          break
        case "error":
          setState((s) => ({ ...s, phase: "idle", error: event.message }))
          es.close()
          break
      }
    }
    es.onerror = () => {
      setState((s) =>
        s.phase === "running" ? { ...s, phase: "idle", error: "Connection lost. Try again." } : s,
      )
      es.close()
    }
  }, [input])

  return (
    <section>
      <WitnessForm input={input} setInput={setInput} onObserve={observe} busy={state.phase === "running"} />
      {state.phase === "idle" && !state.error && (
        <div className="witness-examples">
          <span className="examples-label">Try:</span>
          {EXAMPLES.map((e) => (
            <button key={e} type="button" onClick={() => setInput(e)}>
              {new URL(e).hostname.replace("www.", "")}
            </button>
          ))}
        </div>
      )}
      {state.phase === "running" && (
        <p className="witness-ticker" aria-live="polite">
          Witnessing <code>{state.url}</code> from {state.locations.length || "three"} locations — every
          browser through a residential IP, nothing kept.
        </p>
      )}
      {state.error && (
        <p role="alert" className="witness-error">
          {state.error}
        </p>
      )}
      <WitnessGrid state={state} />
      {state.phase === "done" && <WitnessVerdict state={state} />}
      <style>{STYLES}</style>
    </section>
  )
}

const STYLES = `
  .witness-form { display: flex; gap: 0.75rem; margin: 2rem 0 1rem; }
  .witness-form input {
    flex: 1; padding: 0.75rem 1rem; border: 1px solid var(--line);
    border-radius: 8px; background: var(--paper-warm); color: var(--ink); font: inherit;
  }
  .witness-form button {
    padding: 0.75rem 1.5rem; border: none; border-radius: 8px;
    background: var(--accent); color: #fff; font: inherit; font-weight: 500; cursor: pointer;
  }
  .witness-form button:disabled { opacity: 0.6; cursor: wait; }
  .witness-examples { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin-bottom: 1.5rem; }
  .examples-label { font-size: 0.8rem; color: var(--ink-muted); }
  .witness-examples button {
    font: inherit; font-size: 0.8rem; padding: 0.35rem 0.85rem; border-radius: 999px;
    border: 1px solid var(--line); background: transparent; color: var(--ink-muted); cursor: pointer;
  }
  .witness-examples button:hover { color: var(--ink); border-color: var(--ink-muted); }
  .witness-ticker {
    color: var(--ink-muted); font-size: 0.9rem; margin: 0 0 1.5rem;
    animation: wfade 0.4s ease;
  }
  @keyframes wfade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes wpulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
  .witness-grid {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: 1rem;
  }
  .witness-card {
    border: 1px solid var(--line); border-radius: 12px; padding: 1.25rem;
    background: var(--paper-warm); animation: wfade 0.5s ease;
  }
  .witness-card.ok { border-color: #3e8e5a66; }
  .witness-card.failed { border-color: #c26b3f88; }
  .witness-card h2 { margin: 0 0 0.35rem; font-size: 1.05rem; }
  .witness-card .egress {
    font-size: 0.8rem; color: var(--ink-muted); margin: 0 0 0.75rem;
    font-family: "JetBrains Mono", monospace;
  }
  .witness-card .title { font-weight: 500; margin: 0 0 0.5rem; line-height: 1.4; }
  .witness-card .label {
    font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em;
    color: var(--ink-muted); display: inline-block; width: 4.5rem;
  }
  .witness-card p { font-size: 0.88rem; margin: 0.3rem 0; }
  .witness-beat {
    display: inline-flex; align-items: center; gap: 0.4rem;
    font-size: 0.8rem; color: var(--ink-muted); font-style: italic;
  }
  .witness-beat::before {
    content: ""; width: 0.5rem; height: 0.5rem; border-radius: 50%;
    background: var(--accent); animation: wpulse 1.2s ease infinite;
  }
  .witness-stamp {
    display: inline-block; padding: 0.2rem 0.6rem; border-radius: 6px;
    font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 500;
    animation: wstamp 0.45s cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  .witness-stamp.ok { background: #3e8e5a22; color: #2d6b44; }
  .witness-stamp.failed { background: #c26b3f22; color: #a5542e; }
  .witness-verdict { margin-top: 2.5rem; padding-top: 1.5rem; border-top: 2px solid var(--line); animation: wfade 0.6s ease; }
  .witness-verdict h2 { font-size: 1.6rem; margin: 0 0 0.75rem; }
  .witness-verdict h2.split { color: var(--accent); }
  .witness-verdict .verdict-summary { color: var(--ink-muted); margin: 0 0 1rem; }
  .witness-verdict ul { list-style: none; padding: 0; margin: 0; }
  .witness-verdict li {
    display: flex; gap: 0.75rem; align-items: baseline; padding: 0.5rem 0;
    border-bottom: 1px solid var(--line); line-height: 1.6; font-size: 0.92rem;
  }
  .witness-verdict li:last-child { border-bottom: none; }
  .witness-teardown {
    margin-top: 1.25rem; font-size: 0.85rem; color: var(--ink-muted); font-style: italic;
    animation: wfade 0.8s ease 0.15s both;
  }
  .witness-error { color: var(--accent); }
  code { font-family: "JetBrains Mono", monospace; font-size: 0.8em; }

  @keyframes wstamp {
    from { opacity: 0; transform: scale(1.35); }
    to { opacity: 1; transform: scale(1); }
  }
`

function WitnessForm(props: {
  input: string
  setInput: (v: string) => void
  onObserve: () => void
  busy: boolean
}) {
  return (
    <form
      className="witness-form"
      onSubmit={(e) => {
        e.preventDefault()
        props.onObserve()
      }}
    >
      <input
        type="url"
        required
        placeholder="https://example.com/pricing"
        value={props.input}
        onChange={(e) => props.setInput(e.target.value)}
        aria-label="URL to observe"
      />
      <button type="submit" disabled={props.busy}>
        {props.busy ? "Witnessing…" : "Witness it"}
      </button>
    </form>
  )
}

function WitnessGrid({ state }: { state: State }) {
  return (
    <>
      {state.locations.length > 0 && (
        <div className="witness-grid">
          {state.locations.map((loc) => {
            const obs = state.observations[loc.code]
            const ip = state.egress[loc.code]
            const beat = cardBeat(obs, ip)
            return (
              <article key={loc.code} className={`witness-card ${obs ? (obs.ok ? "ok" : "failed") : ""}`}>
                <h2>{loc.label}</h2>
                <p className="egress">
                  {ip ? (
                    <>
                      egress <code>{ip}</code>
                    </>
                  ) : obs?.error ? (
                    "egress —"
                  ) : (
                    "assigning exit…"
                  )}
                </p>
                {!obs && <BeatLabel beat={beat} />}
                {obs?.ok ? (
                  <>
                    <p className="title">{obs.title || "(no title)"}</p>
                    {obs.prices.length > 0 && (
                      <p>
                        <span className="label">Prices</span> {obs.prices.join(" · ")}
                      </p>
                    )}
                    {obs.currencies.length > 0 && (
                      <p>
                        <span className="label">Currency</span> {obs.currencies.join(", ")}
                      </p>
                    )}
                    <p>
                      <span className="label">Content</span> {obs.bodyLength.toLocaleString()} chars ·{" "}
                      {(obs.durationMs / 1000).toFixed(1)}s
                    </p>
                    <p>
                      <span className={`witness-stamp ok`}>seen</span>
                    </p>
                  </>
                ) : obs ? (
                  <>
                    <p className="witness-error">{obs.error ?? "Failed."}</p>
                    <p>
                      <span className={`witness-stamp failed`}>unseen</span>
                    </p>
                  </>
                ) : null}
              </article>
            )
          })}
        </div>
      )}
    </>
  )
}

function cardBeat(obs: LocationObservation | undefined, ip: string | undefined): CardBeat {
  if (!obs) return ip ? "reading" : "launching"
  return obs.ok ? "ok" : "failed"
}

const BEAT_TEXT: Record<CardBeat, string> = {
  launching: "launching a stealth browser…",
  alibi: "confirming the alibi…",
  reading: "reading the page…",
  ok: "seen",
  failed: "unseen",
}

function BeatLabel({ beat }: { beat: CardBeat }) {
  return <p className="witness-beat">{BEAT_TEXT[beat]}</p>
}

function WitnessVerdict({ state }: { state: State }) {
  const okCount = state.locations.filter((l) => state.observations[l.code]?.ok).length
  const diffCount = state.differences.length
  return (
    <div className="witness-verdict" aria-live="polite">
      <h2 className={state.identical ? "" : "split"}>
        {state.identical ? "One web — this time." : "Not one web."}
      </h2>
      <p className="verdict-summary">
        {okCount} of {state.locations.length} locations saw the page
        {diffCount > 0
          ? `, with ${diffCount} difference${diffCount === 1 ? "" : "s"} between them.`
          : " — and no differences between them."}
      </p>
      {diffCount > 0 ? (
        <ul>
          {state.differences.map((d, i) => (
            <li key={i}>
              <span className={`witness-stamp ${d.kind === "availability" ? "failed" : "ok"}`}>{d.kind}</span>
              {d.detail}
            </li>
          ))}
        </ul>
      ) : (
        <p>
          Every location saw the same page — and every location reached it through a different residential
          IP. The page cannot tell them apart. That is the point.
        </p>
      )}
      <p className="witness-teardown">
        Teardown complete: every browser closed, every proxy released, nothing kept. You were never there.
      </p>
    </div>
  )
}

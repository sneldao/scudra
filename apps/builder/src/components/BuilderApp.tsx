import { useState, useRef, useCallback, useEffect } from "react"
import type { Blueprint } from "../lib/types.js"

type Phase = "idle" | "building" | "live" | "teardown" | "gone"

interface State {
  phase: Phase
  blueprint: Blueprint | null
  bytes: number
  sandboxId: string | null
  previewUrl: string | null
  error: string | null
}

const initial: State = {
  phase: "idle",
  blueprint: null,
  bytes: 0,
  sandboxId: null,
  previewUrl: null,
  error: null,
}

const EXAMPLES = [
  "a todo list for my last day alive",
  "a countdown clock to deletion",
  "a guestbook that gets burned",
  "a launch page for an ephemeral startup",
]

export default function BuilderApp() {
  const [state, setState] = useState<State>(initial)
  const [prompt, setPrompt] = useState("")
  const esRef = useRef<EventSource | null>(null)

  const build = useCallback(() => {
    const p = prompt.trim()
    if (!p) return
    esRef.current?.close()

    setState({ ...initial, phase: "building" })
    const es = new EventSource(`/api/build?prompt=${encodeURIComponent(p)}`)
    esRef.current = es

    es.onmessage = (msg) => {
      const event = JSON.parse(msg.data)
      switch (event.type) {
        case "planning":
          setState((s) => ({ ...s, blueprint: event.blueprint }))
          break
        case "writing":
          setState((s) => ({ ...s, bytes: event.bytes }))
          break
        case "preview":
          setState((s) => ({
            ...s,
            phase: "live",
            sandboxId: event.sandboxId,
            previewUrl: event.previewUrl,
          }))
          break
        case "teardown":
          setState((s) => ({ ...s, phase: "teardown" }))
          break
        case "complete":
          setState((s) => ({ ...s, phase: "gone" }))
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
        s.phase === "building" || s.phase === "live" || s.phase === "teardown"
          ? { ...s, phase: "idle", error: "Connection lost. The build may still be running — try again." }
          : s,
      )
      es.close()
    }
  }, [prompt])

  return (
    <section>
      <BuildForm prompt={prompt} setPrompt={setPrompt} onBuild={build} busy={state.phase !== "idle"} />
      {state.phase === "idle" && !state.error && (
        <div className="sc-chips">
          {EXAMPLES.map((e) => (
            <button key={e} type="button" onClick={() => setPrompt(e)}>
              {e}
            </button>
          ))}
        </div>
      )}
      {state.error && (
        <p role="alert" className="sc-error">
          {state.error}
        </p>
      )}
      {state.blueprint && <BlueprintCard blueprint={state.blueprint} bytes={state.bytes} />}
      {state.previewUrl && <PreviewCard url={state.previewUrl} phase={state.phase} />}
      {state.phase === "teardown" && <p className="sc-teardown">Destroying the machine that hosted it…</p>}
      {state.phase === "gone" && <Tombstone />}
      <style>{STYLES}</style>
    </section>
  )
}

const STYLES = `
  .blueprint-card h2 { margin: 0 0 0.35rem; font-size: 1.1rem; }
  .blueprint-card p, .preview-card p { margin: 0; font-size: 0.9rem; }
  .preview-card a { color: var(--accent); }
`

function BuildForm(props: {
  prompt: string
  setPrompt: (v: string) => void
  onBuild: () => void
  busy: boolean
}) {
  return (
    <form
      className="sc-form"
      onSubmit={(e) => {
        e.preventDefault()
        props.onBuild()
      }}
    >
      <input
        placeholder="Describe a small app…"
        value={props.prompt}
        onChange={(e) => props.setPrompt(e.target.value)}
        aria-label="App prompt"
        maxLength={200}
      />
      <button type="submit" disabled={props.busy}>
        {props.busy ? "Building…" : "Build it"}
      </button>
    </form>
  )
}

function BlueprintCard({ blueprint, bytes }: { blueprint: Blueprint; bytes: number }) {
  return (
    <div className="sc-card blueprint-card">
      <h2>{blueprint.title}</h2>
      <p>
        {blueprint.kind} · {bytes.toLocaleString()} bytes · staged into a fresh sandbox
      </p>
    </div>
  )
}

function PreviewCard({ url, phase }: { url: string; phase: Phase }) {
  const dead = phase === "teardown" || phase === "gone"
  // The orchestrator holds the sandbox live for ~60s before teardown; show a
  // visible countdown so the ephemerality is legible (see DESIGN.md).
  const [secondsLeft, setSecondsLeft] = useState(60)
  useEffect(() => {
    if (phase !== "live") return
    setSecondsLeft(60)
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(id)
  }, [phase])

  return (
    <div className="sc-card preview-card">
      {dead ? (
        <p>
          <code>{url}</code>
          <br />
          <span className="sc-error">This URL is a tombstone now.</span>
        </p>
      ) : (
        <p>
          Live now —{" "}
          <a href={url} target="_blank" rel="noreferrer">
            {url}
          </a>
          <br />
          <span style={{ color: "var(--ink-muted)", fontSize: "0.85rem" }}>
            Dies in {secondsLeft}s — go click things.
          </span>
        </p>
      )}
    </div>
  )
}

function Tombstone() {
  return (
    <div className="sc-tombstone" aria-live="polite">
      <h2>Gone.</h2>
      <p>
        The sandbox is destroyed. The preview URL now leads nowhere — try it.
        No database, no storage, no residue. <em>You were never there.</em>
      </p>
    </div>
  )
}

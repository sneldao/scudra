import { useEffect, useState } from "react"
import { verdict, type RunState } from "../lib/runState.js"

const STEPS = [
  ["born", "BORN"],
  ["executing", "RUNNING"],
  ["destroyed", "DESTROYED"],
] as const
const order = { none: -1, born: 0, executing: 1, destroyed: 2 } as const

export default function MachinePanel({ run }: { run: RunState }) {
  const live = (run.machine === "born" || run.machine === "executing") && run.phase === "running"
  const [age, setAge] = useState(0)
  useEffect(() => {
    if (!live) return
    const t0 = Date.now()
    const t = setInterval(() => setAge(Date.now() - t0), 200)
    return () => clearInterval(t)
  }, [live, run.sandbox?.id])

  const v = verdict(run)
  const cancelled = run.phase === "cancelled" && run.machine !== "destroyed"
  const title = cancelled
    ? "Cancelled"
    : run.machine === "none"
      ? "No machine"
      : run.machine === "destroyed"
        ? "Destroyed"
        : run.machine === "born"
          ? "Booted"
          : "Executing"

  return (
    <aside className="machine" aria-label="Sandbox machine">
      <div className="card">
        <div className="m-head">
          <div className="m-state">
            <span className={`dot ${live ? "live" : run.machine === "destroyed" ? "ok" : ""}`} />
            {title}
          </div>
          <span className="eyebrow">{run.sandbox?.provider ?? "sandbox"}</span>
        </div>

        <div className="m-timeline" role="list">
          {STEPS.map(([key, label]) => {
            const cur = order[run.machine]
            const cls = cur === order[key] ? (key === "destroyed" ? "done" : "on") : cur > order[key] ? "done" : ""
            return (
              <div key={key} role="listitem" className={`m-step ${cls}`}>
                {label}
              </div>
            )
          })}
        </div>

        {!run.sandbox ? (
          <p className="m-empty">
            Every task gets its own machine. It is created for this run only, and destroyed the moment the work is done.
          </p>
        ) : (
          <div className="m-body">
            <div className="kv">
              <span>container</span>
              <span>{run.sandbox.id.slice(0, 22)}</span>
            </div>
            <div className="kv">
              <span>{run.machine === "destroyed" ? "lived" : "age"}</span>
              <span>{((run.teardown?.lifetimeMs ?? age) / 1000).toFixed(1)}s</span>
            </div>
            <div className="kv">
              <span>boot</span>
              <span>{run.sandbox.bootMs} ms</span>
            </div>
            <div className="kv deny">
              <span>network</span>
              <span>none</span>
            </div>
            <div className="kv deny">
              <span>secrets inside</span>
              <span>0</span>
            </div>
            <div className="kv">
              <span>memory cap</span>
              <span>{run.sandbox.limits.memoryMb} MB</span>
            </div>
            <div className="kv">
              <span>cpu / pids</span>
              <span>
                {run.sandbox.limits.cpus} / {run.sandbox.limits.pids}
              </span>
            </div>
            <div className="kv">
              <span>time cap</span>
              <span>{run.sandbox.limits.execTimeoutMs / 1000}s / run</span>
            </div>
            <div className="kv">
              <span>root fs</span>
              <span>read-only</span>
            </div>
          </div>
        )}

        {cancelled && run.sandbox && (
          <div className="verdict unverified" role="status">
            <b>Teardown in progress.</b>
            <small>
              You disconnected. The server destroys the container on disconnect — the sandbox count in the header should
              return to 0.
            </small>
          </div>
        )}

        {v && (
          <div className={`verdict ${v}`} role="status">
            {v === "contained" && (
              <>
                <b>Contained.</b>
                <small>Destruction verified — the container no longer exists.</small>
              </>
            )}
            {v === "unverified" && (
              <>
                <b>Cleanup unverified.</b>
                <small>The container could not be confirmed gone. Check the host.</small>
              </>
            )}
            {v === "breach" && (
              <>
                <b>Breach.</b>
                <small>At least one hostile action succeeded.</small>
              </>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}

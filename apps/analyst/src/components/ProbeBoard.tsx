import { PROBES } from "../lib/probe.js"
import { blockedCount, escapedCount, type RunState } from "../lib/runState.js"

export default function ProbeBoard({ run }: { run: RunState }) {
  const done = run.probes.length
  const blocked = blockedCount(run)
  const escaped = escapedCount(run)
  return (
    <section className="card" aria-live="polite">
      <div className="probe-head">
        <div>
          <div className="eyebrow">Containment moment</div>
          <h2 style={{ fontSize: 24, marginTop: 6 }}>Seven attacks on a live sandbox</h2>
        </div>
        <div className="probe-score" aria-label={`${blocked} of ${PROBES.length} blocked`}>
          {blocked}/{PROBES.length}
          <small>{escaped > 0 ? `${escaped} ESCAPED` : done === PROBES.length ? "all blocked" : "blocked"}</small>
        </div>
      </div>
      <div className="probes">
        {PROBES.map((p, i) => {
          const r = run.probes.find((x) => x.index === i + 1)
          return (
            <div key={p.name} className={`probe ${r ? "" : "pending"}`}>
              <span className="no">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <b>{p.name}</b>
                <div className="desc">{p.description}</div>
                {r && <pre>{r.evidence}</pre>}
              </div>
              {r ? (
                <span className={`stamp ${r.status}`}>{r.status === "blocked" ? "BLOCKED" : "ESCAPED"}</span>
              ) : run.phase === "running" && done === i ? (
                <span className="dot live" />
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}

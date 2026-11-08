import { useState } from "react"
import type { Receipt } from "../lib/receipt.js"

export default function ReceiptCard({ receipt }: { receipt: Receipt }) {
  const [state, setState] = useState<"idle" | "checking" | "valid" | "invalid">("idle")
  const [tampered, setTampered] = useState(false)

  async function verify(r: Receipt) {
    setState("checking")
    const res = await fetch("/api/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ receipt: r }),
    })
    const j = (await res.json().catch(() => ({ valid: false }))) as { valid: boolean }
    setState(j.valid ? "valid" : "invalid")
  }
  // The "tamper" demo: flip one field client-side, send it, watch verification fail.
  const forged = (): Receipt => ({ ...receipt, destroyVerified: !receipt.destroyVerified, exitCode: 0 })

  const rows: [string, string][] = [
    ["run", receipt.runId],
    ["model", receipt.model],
    ["image", receipt.image],
    ["lifetime", `${((+new Date(receipt.sandboxDestroyedAt) - +new Date(receipt.sandboxBornAt)) / 1000).toFixed(1)}s`],
    ["destroyed", receipt.destroyVerified ? "yes — verified" : "NOT verified"],
    ["attempts", String(receipt.attempts)],
    ["verification", receipt.verification ?? "—"],
    ["code sha256", receipt.codeSha256 ?? "—"],
    ["output sha256", receipt.stdoutSha256 ?? "—"],
    ["dataset sha256", receipt.datasetSha256 ?? "—"],
    ...receipt.artifacts.map((a): [string, string] => [a.name, `${a.sha256} · ${a.bytes} B`]),
    ["signature", receipt.signature],
  ]
  return (
    <details className="card receipt">
      <summary
        style={{
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          listStyle: "none",
        }}
      >
        <span>
          <span className="eyebrow">Signed receipt</span>
          <br />
          <span style={{ fontFamily: "var(--serif)", fontSize: 17 }}>Proof of what ran</span>
        </span>
        <span className="hint">hashes + HMAC ▾</span>
      </summary>
      <div style={{ marginTop: 12 }}>
        {rows.map(([k, v]) => (
          <div className="row" key={k}>
            <span>{k}</span>
            <span>{v}</span>
          </div>
        ))}
        <div className="verifybox">
          <button
            className="btn sm ghost"
            onClick={() => {
              setTampered(false)
              verify(receipt)
            }}
          >
            Verify
          </button>
          <button
            className="btn sm attack"
            onClick={() => {
              setTampered(true)
              verify(forged())
            }}
          >
            Forge it &amp; verify
          </button>
          <button
            className="btn sm ghost"
            onClick={() => navigator.clipboard?.writeText(JSON.stringify(receipt, null, 2))}
          >
            Copy JSON
          </button>
          {state === "checking" && <span className="vres">checking…</span>}
          {state === "valid" && <span className="vres ok">✓ signature valid{tampered ? " (unexpected!)" : ""}</span>}
          {state === "invalid" && (
            <span className="vres bad">
              ✗ {tampered ? "tampering detected — signature invalid" : "signature invalid"}
            </span>
          )}
        </div>
      </div>
    </details>
  )
}

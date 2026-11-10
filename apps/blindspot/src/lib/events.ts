// Investigation event types — emitted by the orchestrator, consumed by the
// SSE server and the live UI.
//
// Each event maps to a UI beat in the orb lifecycle:
//   started     → orb materializes, search bar contracts
//   ens:resolved → pulse, phase text shows address
//   sandbox:booted → pulse, phase text shows sandbox ID
//   browser:connected → pulse, phase text shows egress IP
//   mobula:data → pulse, phase text shows portfolio summary
//   offchain:data → pulse, phase text shows source count
//   analyzing → phase text shows "analyzing risk..."
//   complete → orb shatters, finale cascade begins
//   error → orb dissolves, error message shown

export type InvestigationEvent =
  | { type: "started"; ensName: string }
  | { type: "phase"; phase: PhaseLabel; status: "working" | "done"; detail?: string }
  | {
      type: "ens:resolved"
      name: string
      address: string
      aliases: string[]
      website: string | null
      twitter: string | null
    }
  | { type: "sandbox:booted"; sandboxId: string }
  | { type: "browser:connected"; egressIp: string; proxyCountry: string }
  | { type: "mobula:data"; totalValueUSD: number; assetCount: number; realizedPnlUSD: number }
  | { type: "offchain:data"; sourceCount: number }
  | { type: "analyzing" }
  | { type: "complete"; report: CompletePayload }
  | { type: "error"; message: string }

export type PhaseLabel = "resolving" | "sandbox" | "proxy" | "onchain" | "offchain" | "analyzing"

export interface CompletePayload {
  riskScore: number
  riskLabel: string
  riskSummary: string
  privacyVerdict: string
  reportPath: string
  sandboxId: string
  egressIp: string
  sandboxDestroyed: boolean
  recordingAvailable: boolean
  /** The persisted case, so the user can come back to it. Null if not stored. */
  caseId: string | null
  /** What this investigation cost, in USD cents. */
  costUsdCents: number
  /** Figures the verdict relied on, and how many were independently confirmed. */
  grounded: number
  groundingChecked: number
}

export type EventCallback = (event: InvestigationEvent) => void

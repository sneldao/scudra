// Orchestrator — coordinates the full investigation pipeline.
//
// Emits typed events via a callback. The SSE server forwards these to the
// live UI; the CLI mode prints them to the console. The same orchestrator
// powers both.
//
// Flow:
//   1. Validate config + resolve ENS name locally (public RPC)
//   2. Spin up Solari sandbox → run Mobula API calls inside it (ephemeral)
//   3. Spin up Solari stealth browser → enrich off-chain context (residential proxy)
//   4. Analyze combined data → risk score
//   5. Generate HTML report with privacy manifest
//   6. Tear down: kill sandbox, release browser session, download recording,
//      close browser client — in that order (see browser.ts for why)

import { resolveEns, isValidEnsName } from "./ens.js"
import { fetchOnchainData } from "./mobula.js"
import { createSandbox, destroySandbox } from "./sandbox.js"
import {
  createStealthBrowser,
  enrichOffChain,
  releaseBrowserSession,
  closeBrowserClient,
  downloadRecording,
} from "./browser.js"
import { assessRisk } from "./analyzer.js"
import { generateReport } from "./report.js"
import { formatCompact, riskLabelFor } from "./format.js"
import type { MobulaData, OffChainContext, InvestigationReport, PrivacyManifest } from "./types.js"
import type { EventCallback, InvestigationEvent } from "./events.js"
import { mkdirSync } from "node:fs"

export class MissingConfigError extends Error {
  readonly missing: string[]
  constructor(missing: string[]) {
    super(`Missing required environment variables: ${missing.join(", ")}`)
    this.name = "MissingConfigError"
    this.missing = missing
  }
}

export interface InvestigateOptions {
  outputDir?: string
  onEvent?: EventCallback
}

export async function investigate(ensName: string, opts: InvestigateOptions = {}): Promise<string> {
  const { outputDir = "reports", onEvent } = opts
  const emit = (event: InvestigationEvent) => {
    onEvent?.(event)
  }

  // Config must be checked before any work — ENS resolution used to run first
  // and burn an RPC round-trip before the missing-key failure surfaced.
  const SOLARI_API_KEY = process.env.SOLARI_API_KEY
  const MOBULA_API_KEY = process.env.MOBULA_API_KEY
  const missing = [SOLARI_API_KEY ? null : "SOLARI_API_KEY", MOBULA_API_KEY ? null : "MOBULA_API_KEY"].filter(
    (key): key is string => key !== null,
  )
  if (missing.length > 0) {
    throw new MissingConfigError(missing)
  }

  if (!isValidEnsName(ensName)) {
    throw new Error(`Invalid ENS name: ${ensName}`)
  }

  const startTime = Date.now()

  emit({ type: "started", ensName })

  // 1. ENS resolution — local, public RPC
  emit({ type: "phase", phase: "resolving", status: "working" })
  const target = await resolveEns(ensName)
  emit({
    type: "ens:resolved",
    name: target.name,
    address: target.address,
    aliases: target.aliases,
    website: target.website,
    twitter: target.twitter,
  })
  emit({ type: "phase", phase: "resolving", status: "done", detail: target.address })

  // 2 + 3. Spin up sandbox and stealth browser concurrently
  const [sandboxHandle, browserHandle] = await Promise.all([
    createSandbox(SOLARI_API_KEY!),
    createStealthBrowser(SOLARI_API_KEY!),
  ])

  emit({ type: "sandbox:booted", sandboxId: sandboxHandle.id })
  emit({ type: "phase", phase: "sandbox", status: "done", detail: sandboxHandle.id })

  emit({
    type: "browser:connected",
    egressIp: "detecting...",
    proxyCountry: browserHandle.proxy?.country ?? "us",
  })

  let onchain: MobulaData | undefined
  let offChain: OffChainContext[] = []
  try {
    // Run onchain analysis (in sandbox) and off-chain enrichment (stealth browser) in parallel
    emit({ type: "phase", phase: "onchain", status: "working" })
    emit({ type: "phase", phase: "offchain", status: "working" })

    ;[onchain, offChain] = await Promise.all([
      fetchOnchainData(sandboxHandle.sandbox, target.address, MOBULA_API_KEY!),
      enrichOffChain(browserHandle, target),
    ])

    emit({
      type: "mobula:data",
      totalValueUSD: onchain.totalValueUSD,
      assetCount: onchain.portfolio.length,
      realizedPnlUSD: onchain.totalRealizedPnlUSD,
    })
    emit({
      type: "phase",
      phase: "onchain",
      status: "done",
      detail: `$${formatCompact(onchain.totalValueUSD)} · ${onchain.portfolio.length} assets`,
    })

    // Update browser egress IP if we got it from off-chain enrichment
    if (offChain.length > 0 && offChain[0].egressIp !== "detecting...") {
      emit({
        type: "browser:connected",
        egressIp: offChain[0].egressIp,
        proxyCountry: browserHandle.proxy?.country ?? "us",
      })
    }
    emit({ type: "offchain:data", sourceCount: offChain.length })
    emit({
      type: "phase",
      phase: "offchain",
      status: "done",
      detail: `${offChain.length} sources`,
    })
  } finally {
    // 6. Tear down — always, even on error. Teardown failures are logged but
    // never mask the pipeline error that caused them.
    await quietly("sandbox kill", () => destroySandbox(sandboxHandle))
    if (onchain === undefined) {
      // The pipeline failed — no recording to fetch, so release the session
      // and close the client right away.
      await quietly("browser release", () => releaseBrowserSession(browserHandle))
      await quietly("browser close", () => closeBrowserClient(browserHandle))
    } else {
      // Success path: release the session but KEEP the client open — the
      // replay uploads asynchronously after release and downloadRecording
      // below needs the client. closeBrowserClient runs once reporting ends.
      await quietly("browser release", () => releaseBrowserSession(browserHandle))
    }
  }

  try {
    // 4. Risk assessment
    emit({ type: "analyzing" })
    emit({ type: "phase", phase: "analyzing", status: "working" })
    const risk = assessRisk(target, onchain!, offChain)
    emit({ type: "phase", phase: "analyzing", status: "done", detail: `${risk.overallScore}/100` })

    // Download session recording — while the client is still open. This used
    // to run after the client was closed, so the download always failed.
    const recording = await downloadRecording(browserHandle)

    // Build privacy manifest
    const privacy: PrivacyManifest = {
      protectedData: [
        "Investigator's real IP address",
        "Investigator's browser fingerprint",
        "That an investigation of this target occurred",
        "What onchain data was queried (Mobula sees sandbox IP, not investigator)",
        "What websites were visited (target sees residential proxy IP)",
      ],
      adversaries: [
        "The target entity (website operator)",
        "Mobula (onchain data provider)",
        "ISP / network observer",
        "Future correlation attempts (no persistent state)",
      ],
      mechanisms: [
        `Ephemeral Solari sandbox (${sandboxHandle.id}) — killed after investigation, no state persists`,
        `Stealth browser with residential proxy (${browserHandle.proxy?.country ?? "us"}) — fingerprint masked, IP rotated`,
        `ENS as discovery layer — investigator queries by name, not by linking address to identity`,
        `Session recording opt-in only — replay available for audit, not stored by default`,
      ],
      sandboxId: sandboxHandle.id,
      browserSessionId: browserHandle.sessionId,
      egressIp: offChain[0]?.egressIp ?? "unknown",
      sandboxDestroyed: true,
      recordingAvailable: recording.available,
    }

    // 5. Generate report
    mkdirSync(outputDir, { recursive: true })
    const report: InvestigationReport = {
      target,
      onchain: onchain!,
      offChain,
      risk,
      privacy,
      timestamp: new Date().toISOString(),
      duration: (Date.now() - startTime) / 1000,
    }

    const reportPath = generateReport(report, outputDir)

    emit({
      type: "complete",
      report: {
        riskScore: risk.overallScore,
        riskLabel: riskLabelFor(risk.overallScore),
        riskSummary: risk.summary,
        privacyVerdict: "sandbox destroyed · no trace · you were never there",
        reportPath,
        sandboxId: sandboxHandle.id,
        egressIp: offChain[0]?.egressIp ?? "unknown",
        sandboxDestroyed: true,
        recordingAvailable: recording.available,
      },
    })

    return reportPath
  } finally {
    // Last act, success or failure: drop the client so the process can exit.
    await quietly("browser close", () => closeBrowserClient(browserHandle))
  }
}

async function quietly(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
  } catch (err) {
    console.error(`  [orchestrator] teardown ${label} failed: ${(err as Error).message}`)
  }
}

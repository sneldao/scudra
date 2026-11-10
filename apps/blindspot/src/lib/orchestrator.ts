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
  type BrowserHandle,
} from "./browser.js"
import { assessRisk } from "./analyzer.js"
import { generateReport } from "./report.js"
import { formatCompact, riskLabelFor } from "./format.js"
import { buildReceipt } from "./evidence.js"
import { loadConfig } from "./config.js"
import { CaseStore } from "./store.js"
import type { MobulaData, OffChainContext, InvestigationReport, PrivacyManifest } from "./types.js"
import type { EventCallback, InvestigationEvent } from "./events.js"
import { mkdirSync } from "node:fs"
import { randomUUID } from "node:crypto"

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
  /** Persist the case so the user can come back to it. */
  store?: CaseStore | null
  /**
   * Cost of this investigation in USD cents.
   *
   * Tracked because agent economics are a decision the user has to make, and
   * a tool that hides its cost makes that decision impossible.
   */
  costUsdCents?: number
}

export async function investigate(ensName: string, opts: InvestigateOptions = {}): Promise<string> {
  const { outputDir = "reports", onEvent, store = null, costUsdCents = 0 } = opts
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
  // 2 + 3. Spin up the sandbox and the stealth browser.
  //
  // The browser is OPTIONAL. A stealth session needs a paid plan (Solari
  // returns 402 FeatureRequiresPlan on the free tier), and an investigator
  // whose off-chain enrichment fails should still get the onchain verdict
  // rather than an error page. A degraded investigation that says what it
  // could not do is worth more than a clean one that never ran.
  const sandboxHandle = await createSandbox(SOLARI_API_KEY!)
  emit({ type: "sandbox:booted", sandboxId: sandboxHandle.id })
  emit({ type: "phase", phase: "sandbox", status: "done", detail: sandboxHandle.id })

  let browserHandle: BrowserHandle | null = null
  let browserUnavailableReason: string | null = null
  try {
    const handle = await createStealthBrowser(SOLARI_API_KEY!)
    browserHandle = handle
    emit({
      type: "browser:connected",
      egressIp: "detecting...",
      proxyCountry: handle.proxy?.country ?? "us",
    })
  } catch (err) {
    browserUnavailableReason = describeBrowserFailure(err)
    console.error(`  [browser] unavailable: ${browserUnavailableReason}`)
    emit({ type: "browser:unavailable", reason: browserUnavailableReason })
  }

  let onchain: MobulaData | undefined
  let offChain: OffChainContext[] = []
  try {
    // Run onchain analysis (in sandbox) and off-chain enrichment (stealth browser) in parallel
    emit({ type: "phase", phase: "onchain", status: "working" })
    emit({ type: "phase", phase: "offchain", status: "working" })

    const offChainPromise = browserHandle
      ? enrichOffChain(browserHandle, target)
      : Promise.resolve<OffChainContext[]>([])

    ;[onchain, offChain] = await Promise.all([
      fetchOnchainData(sandboxHandle.sandbox, target.address, MOBULA_API_KEY!),
      offChainPromise,
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
        proxyCountry: browserHandle?.proxy?.country ?? "us",
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
    if (browserHandle) {
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
  }

  try {
    // 4. Risk assessment
    emit({ type: "analyzing" })
    emit({ type: "phase", phase: "analyzing", status: "working" })
    const risk = assessRisk(target, onchain!, offChain)
    emit({ type: "phase", phase: "analyzing", status: "done", detail: `${risk.overallScore}/100` })

    // Download session recording — while the client is still open. This used
    // to run after the client was closed, so the download always failed.
    const recording = browserHandle ? await downloadRecording(browserHandle) : { sessionId: "none", available: false }

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
        browserHandle
          ? `Stealth browser with residential proxy (${browserHandle.proxy?.country ?? "us"}) — fingerprint masked, IP rotated`
          : `Stealth browser UNAVAILABLE (${browserUnavailableReason}) — off-chain context was NOT collected`,
        `ENS as discovery layer — investigator queries by name, not by linking address to identity`,
        `Session recording opt-in only — replay available for audit, not stored by default`,
      ],
      sandboxId: sandboxHandle.id,
      browserSessionId: browserHandle?.sessionId ?? "none",
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

    // 6. Sign the receipt and persist the case.
    //
    // The receipt is the durable half: the sandbox and browser are already
    // gone by now, and what remains is a signed, grounded record of what was
    // found. The case is saved so the user can come back to it — without
    // persistence, an investigator has bought nothing.
    const caseId = randomUUID()
    const config = loadConfig()
    const { receipt, signals, sources } = buildReceipt({
      id: caseId,
      target,
      onchain: onchain!,
      offChain,
      risk,
      privateKeyPem: config.privateKeyPem,
      publicKeyPem: config.publicKeyPem,
    })

    if (store) {
      try {
        store.save({
          id: caseId,
          ensName: target.name,
          address: target.address,
          riskScore: risk.overallScore,
          riskLabel: riskLabelFor(risk.overallScore),
          summary: risk.summary,
          signals,
          sources,
          costUsdCents,
          durationMs: Date.now() - startTime,
          receipt,
        })
      } catch (err) {
        // A storage failure must not destroy the investigation that already
        // succeeded — the user still has the report and the receipt.
        console.error(`  [store] could not persist case: ${(err as Error).message}`)
      }
    }

    emit({
      type: "complete",
      report: {
        riskScore: risk.overallScore,
        riskLabel: riskLabelFor(risk.overallScore),
        riskSummary: risk.summary,
        privacyVerdict: "sandbox destroyed · no trace · you were never here",
        reportPath,
        sandboxId: sandboxHandle.id,
        egressIp: offChain[0]?.egressIp ?? "unknown",
        sandboxDestroyed: true,
        recordingAvailable: recording.available,
        caseId: store ? caseId : null,
        costUsdCents,
        grounded: receipt.grounding.grounded,
        groundingChecked: receipt.grounding.checked,
      },
    })

    return reportPath
  } finally {
    // Last act, success or failure: drop the client so the process can exit.
    if (browserHandle) {
      await quietly("browser close", () => closeBrowserClient(browserHandle))
    }
  }
}

async function quietly(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
  } catch (err) {
    console.error(`  [orchestrator] teardown ${label} failed: ${(err as Error).message}`)
  }
}

/**
 * A plain-language reason the stealth browser could not start.
 *
 * The common case is a plan that does not include stealth sessions — Solari
 * answers 402 FeatureRequiresPlan on the free tier. That is a BILLING
 * condition, not a bug, and an investigator deserves to be told which it is.
 */
export function describeBrowserFailure(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  if (/402|FeatureRequiresPlan|plan/i.test(raw)) {
    return "the stealth browser needs a paid Solari plan (402 FeatureRequiresPlan)"
  }
  if (/api\s?key|unauthorized|401|403/i.test(raw)) return "the browser service rejected our credentials"
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network|fetch failed/i.test(raw)) {
    return "the browser service could not be reached"
  }
  return raw.slice(0, 160)
}

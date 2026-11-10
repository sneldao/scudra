// The case store — Blindspot's durable half.
//
// The thesis says an investigation leaves no trace. That is true of the
// INFRASTRUCTURE: the sandbox is destroyed, the browser session is released,
// the egress IP is never ours. It is NOT true of the user's own conclusions,
// and it must not be. An investigator who cannot keep their findings has not
// bought anything.
//
// So the split is deliberate and is the most important design decision in
// this codebase:
//
//   THE SUBJECT'S DATA EXPIRES.
//   Raw material about the target — the fetched pages, the API payloads —
//   carries a TTL and is deleted. It is the most sensitive thing we hold, and
//   holding it longer than the investigation needs is the risk.
//
//   THE USER'S EVIDENCE PERSISTS.
//   The verdict, the signals, the sources, the signed receipt — these are the
//   deliverable. They live until the user deletes them.
//
// Getting this backwards in either direction breaks the product: keep
// everything and you're a surveillance archive; keep nothing and you're a
// demo.

import { DatabaseSync } from "node:sqlite"
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"

export interface StoredSignal {
  category: string
  label: string
  severity: "low" | "medium" | "high"
  detail: string
  /** Where this signal came from — the record that grounds it. */
  sources: string[]
}

export interface StoredSource {
  /** Stable id, referenced by signals. */
  id: string
  kind: "onchain" | "offchain" | "ens"
  ref: string
  title: string
  /** Excerpt kept for the user. Not the whole page. */
  excerpt: string
}

export interface StoredCase {
  id: string
  ensName: string
  address: string
  createdAt: string
  /** The subject's raw material expires. */
  rawExpiresAt: string
  riskScore: number
  riskLabel: string
  summary: string
  signals: StoredSignal[]
  sources: StoredSource[]
  /** Cost of this investigation, in USD cents. */
  costUsdCents: number
  durationMs: number
  /** The signed receipt — the part a third party can check. */
  receipt: unknown
  /** User's verdict on our output. Null until they answer. */
  feedback: "wrong" | "incomplete" | "right" | null
  feedbackNote: string | null
  feedbackAt: string | null
}

interface CaseRow {
  id: string
  ens_name: string
  address: string
  created_at: string
  raw_expires_at: string
  risk_score: number
  risk_label: string
  summary: string
  signals_json: string
  sources_json: string
  cost_usd_cents: number
  duration_ms: number
  receipt_json: string
  feedback: string | null
  feedback_note: string | null
  feedback_at: string | null
}

export interface CaseStoreOptions {
  /** Path to the SQLite file. ":memory:" for tests. */
  path: string
  /** How long the subject's raw material survives, in hours. */
  rawTtlHours?: number
}

export class CaseStore {
  private db: DatabaseSync
  private rawTtlHours: number

  constructor(opts: CaseStoreOptions) {
    this.rawTtlHours = opts.rawTtlHours ?? 24
    if (opts.path !== ":memory:") mkdirSync(dirname(opts.path), { recursive: true })
    this.db = new DatabaseSync(opts.path)
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS cases (
        id             TEXT PRIMARY KEY,
        ens_name       TEXT NOT NULL,
        address        TEXT NOT NULL,
        created_at     TEXT NOT NULL,
        raw_expires_at TEXT NOT NULL,
        risk_score     INTEGER NOT NULL,
        risk_label     TEXT NOT NULL,
        summary        TEXT NOT NULL,
        signals_json   TEXT NOT NULL,
        sources_json   TEXT NOT NULL,
        cost_usd_cents INTEGER NOT NULL DEFAULT 0,
        duration_ms    INTEGER NOT NULL DEFAULT 0,
        receipt_json   TEXT NOT NULL,
        feedback       TEXT,
        feedback_note  TEXT,
        feedback_at    TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_cases_created ON cases (created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_cases_raw_expiry ON cases (raw_expires_at);
      CREATE TABLE IF NOT EXISTS events (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        meta       TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_events_name ON events (name, created_at DESC);
      CREATE TABLE IF NOT EXISTS waitlist (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        -- NOCASE: an address is an address whatever the case its owner typed.
        email      TEXT COLLATE NOCASE NOT NULL UNIQUE,
        source     TEXT,
        created_at TEXT NOT NULL
      );
    `)
  }

  private static nowIso(): string {
    return new Date().toISOString()
  }

  /**
   * Store a completed investigation.
   *
   * The raw material's expiry is set at write time, not read time, so the TTL
   * starts when the data was actually collected.
   */
  save(input: {
    id: string
    ensName: string
    address: string
    riskScore: number
    riskLabel: string
    summary: string
    signals: StoredSignal[]
    sources: StoredSource[]
    costUsdCents: number
    durationMs: number
    receipt: unknown
  }): StoredCase {
    const createdAt = CaseStore.nowIso()
    const rawExpiresAt = new Date(Date.now() + this.rawTtlHours * 3_600_000).toISOString()
    this.db
      .prepare(
        `INSERT INTO cases
           (id, ens_name, address, created_at, raw_expires_at, risk_score, risk_label, summary,
            signals_json, sources_json, cost_usd_cents, duration_ms, receipt_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.ensName,
        input.address,
        createdAt,
        rawExpiresAt,
        input.riskScore,
        input.riskLabel,
        input.summary,
        JSON.stringify(input.signals),
        JSON.stringify(input.sources),
        input.costUsdCents,
        input.durationMs,
        JSON.stringify(input.receipt),
      )
    return this.get(input.id)!
  }

  get(id: string): StoredCase | null {
    const row = this.db.prepare(`SELECT * FROM cases WHERE id = ?`).get(id) as CaseRow | undefined
    return row ? this.toCase(row) : null
  }

  /**
   * Most recent first. `limit` bounds the page — a case list is not a dump.
   *
   * `created_at` has millisecond resolution, so two cases saved in the same
   * tick share a timestamp. The rowid tiebreaker breaks that deterministically:
   * rowids increase with insertion order, so "most recent" is always stable.
   */
  list(limit = 50): StoredCase[] {
    const rows = this.db
      .prepare(`SELECT * FROM cases ORDER BY created_at DESC, rowid DESC LIMIT ?`)
      .all(limit) as unknown as CaseRow[]
    return rows.map((r) => this.toCase(r))
  }

  /** Record the user's verdict on our output. */
  setFeedback(id: string, feedback: "wrong" | "incomplete" | "right", note: string | null): boolean {
    const res = this.db
      .prepare(`UPDATE cases SET feedback = ?, feedback_note = ?, feedback_at = ? WHERE id = ?`)
      .run(feedback, note, CaseStore.nowIso(), id)
    return Number(res.changes) > 0
  }

  delete(id: string): boolean {
    const res = this.db.prepare(`DELETE FROM cases WHERE id = ?`).run(id)
    return Number(res.changes) > 0
  }

  /**
   * Delete the subject's raw material whose TTL has passed, keeping the
   * user's evidence.
   *
   * Returns how many cases were scrubbed. Called on a timer; cheap enough to
   * run on every write.
   */
  purgeExpiredRaw(): number {
    const now = CaseStore.nowIso()
    const rows = this.db.prepare(`SELECT id FROM cases WHERE raw_expires_at <= ?`).all(now) as { id: string }[]
    if (rows.length === 0) return 0
    // The excerpts ARE the raw material. Blank them and shorten the sources
    // to their references, so the signals lose their supporting detail but
    // keep their shape and their verdict.
    const blank = this.db.prepare(`UPDATE cases SET sources_json = ? WHERE id = ?`)
    for (const { id } of rows) {
      const c = this.get(id)
      if (!c) continue
      blank.run(JSON.stringify(c.sources.map((s) => ({ ...s, title: s.title, excerpt: "", ref: s.ref }))), id)
    }
    return rows.length
  }

  /**
   * Record a usage event.
   *
   * First-party, coarse, and self-hosted: which page was visited, which run
   * completed, whether anyone came back. We cannot prioritise what to build
   * next without knowing what is used, and "we have no idea" was the honest
   * state of this project for a year.
   *
   * No identifiers, no fingerprinting, no third party.
   */
  recordEvent(name: string, meta: Record<string, unknown> | null = null): void {
    this.db
      .prepare(`INSERT INTO events (name, meta, created_at) VALUES (?, ?, ?)`)
      .run(name, meta ? JSON.stringify(meta) : null, CaseStore.nowIso())
  }

  /** Counts per event name, newest first. */
  eventCounts(): Record<string, number> {
    const rows = this.db.prepare(`SELECT name, COUNT(*) AS n FROM events GROUP BY name`).all() as {
      name: string
      n: number
    }[]
    const out: Record<string, number> = {}
    for (const r of rows) out[r.name] = r.n
    return out
  }

  /** Join the waitlist. Returns false if the address is already on it. */
  addToWaitlist(email: string, source: string | null): boolean {
    const res = this.db
      .prepare(`INSERT OR IGNORE INTO waitlist (email, source, created_at) VALUES (?, ?, ?)`)
      .run(email, source, CaseStore.nowIso())
    return Number(res.changes) > 0
  }

  waitlistSize(): number {
    const row = this.db.prepare(`SELECT COUNT(*) AS n FROM waitlist`).get() as { n: number }
    return row.n
  }

  /**
   * Aggregate view for the operator: how is the product actually used?
   */
  stats(): {
    totalCases: number
    withFeedback: number
    feedbackBreakdown: Record<string, number>
    totalCostUsdCents: number
    eventCounts: Record<string, number>
    waitlistSize: number
  } {
    const total = this.db.prepare(`SELECT COUNT(*) AS n FROM cases`).get() as { n: number }
    const fb = this.db
      .prepare(`SELECT feedback, COUNT(*) AS n FROM cases WHERE feedback IS NOT NULL GROUP BY feedback`)
      .all() as { feedback: string; n: number }[]
    const cost = this.db.prepare(`SELECT COALESCE(SUM(cost_usd_cents), 0) AS c FROM cases`).get() as { c: number }
    const breakdown: Record<string, number> = {}
    for (const row of fb) breakdown[row.feedback] = row.n
    return {
      totalCases: total.n,
      withFeedback: fb.reduce((sum, r) => sum + r.n, 0),
      feedbackBreakdown: breakdown,
      totalCostUsdCents: cost.c,
      eventCounts: this.eventCounts(),
      waitlistSize: this.waitlistSize(),
    }
  }

  close(): void {
    this.db.close()
  }

  private toCase(row: CaseRow): StoredCase {
    return {
      id: row.id,
      ensName: row.ens_name,
      address: row.address,
      createdAt: row.created_at,
      rawExpiresAt: row.raw_expires_at,
      riskScore: row.risk_score,
      riskLabel: row.risk_label,
      summary: row.summary,
      signals: JSON.parse(row.signals_json),
      sources: JSON.parse(row.sources_json),
      costUsdCents: row.cost_usd_cents,
      durationMs: row.duration_ms,
      receipt: JSON.parse(row.receipt_json),
      feedback: (row.feedback as StoredCase["feedback"]) ?? null,
      feedbackNote: row.feedback_note,
      feedbackAt: row.feedback_at,
    }
  }
}

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
//
// THIRD PART: who may read it. A case belongs to the investigator who ran
// it. The store keeps a fingerprint of their owner key, and every read is
// scoped to it. The RECEIPT is the opposite — signed, publishable, meant to
// be handed to someone — and carries its own audience marker so the two are
// never confused.
//
// The waitlist lives in a SEPARATE database (see waitlist.ts): it is our
// contact list and we keep it forever, while the subject's raw material
// expires. Two retention policies do not belong in one file, because one
// backup would then carry both.

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

/**
 * Who a document is for.
 *
 * "private" — the user's working file. Not to be published. The default for
 * everything in a case.
 *
 * "publishable" — safe to hand to someone who is not the user, because it is
 * independently checkable. A receipt qualifies: it is signed, and anyone with
 * the published public key can verify it without trusting us.
 */
export type Audience = "private" | "publishable"

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
  /** Who this case is for. */
  audience: Audience
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
  audience: string
  feedback: string | null
  feedback_note: string | null
  feedback_at: string | null
  owner_key_hash: string
}

export interface CaseStoreOptions {
  /** Path to the SQLite file. ":memory:" for tests. */
  path: string
  /** How long the subject's raw material survives, in hours. */
  rawTtlHours?: number
}

export class CaseStore {
  /** Exposed for the operator's own inspection — never through the API. */
  readonly db: DatabaseSync
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
        audience       TEXT NOT NULL DEFAULT 'private',
        feedback       TEXT,
        feedback_note  TEXT,
        feedback_at    TEXT
      );
    `)
    this.migrate()
  }

  /**
   * Bring an older database up to the current shape.
   *
   * CREATE TABLE IF NOT EXISTS does not add columns to an existing table, so
   * a database created before these fields existed needs them added
   * explicitly. Each is additive and has a default, so the rows already
   * there keep working.
   */
  private migrate(): void {
    const columns = new Set(
      (this.db.prepare(`PRAGMA table_info(cases)`).all() as { name: string }[]).map((c) => c.name),
    )
    if (!columns.has("audience")) {
      this.db.exec(`ALTER TABLE cases ADD COLUMN audience TEXT NOT NULL DEFAULT 'private'`)
    }
    if (!columns.has("owner_key_hash")) {
      // Existing cases predate ownership. They are left unowned: the store
      // will not hand them to anyone, because there is no owner to hand them
      // to. An operator can reclaim them deliberately.
      this.db.exec(`ALTER TABLE cases ADD COLUMN owner_key_hash TEXT NOT NULL DEFAULT ''`)
    }
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_cases_created ON cases (created_at DESC)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_cases_raw_expiry ON cases (raw_expires_at)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_cases_owner ON cases (owner_key_hash)`)
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
    /** The fingerprint of the owner this case belongs to. */
    ownerKeyHash: string
  }): StoredCase {
    const createdAt = CaseStore.nowIso()
    const rawExpiresAt = new Date(Date.now() + this.rawTtlHours * 3_600_000).toISOString()
    this.db
      .prepare(
        `INSERT INTO cases
           (id, ens_name, address, created_at, raw_expires_at, risk_score, risk_label, summary,
            signals_json, sources_json, cost_usd_cents, duration_ms, receipt_json, audience, owner_key_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        "private",
        input.ownerKeyHash,
      )
    return this.get(input.id)!
  }

  /** Fetch a case by id, with no ownership check. Operator use only. */
  get(id: string): StoredCase | null {
    const row = this.db.prepare(`SELECT * FROM cases WHERE id = ?`).get(id) as CaseRow | undefined
    return row ? this.toCase(row) : null
  }

  /**
   * Fetch a case that belongs to this owner.
   *
   * This is the only read path the API should use. An id alone is not
   * authorisation.
   */
  getForOwner(id: string, ownerKeyHash: string): StoredCase | null {
    const row = this.db.prepare(`SELECT * FROM cases WHERE id = ? AND owner_key_hash = ?`).get(id, ownerKeyHash) as
      CaseRow | undefined
    return row ? this.toCase(row) : null
  }

  /**
   * Most recent first, scoped to one owner.
   *
   * `limit` bounds the page — a case list is not a dump.
   *
   * `created_at` has millisecond resolution, so two cases saved in the same
   * tick share a timestamp. The rowid tiebreaker breaks that deterministically:
   * rowids increase with insertion order, so "most recent" is always stable.
   */
  list(limit = 50, ownerKeyHash?: string): StoredCase[] {
    const rows = (ownerKeyHash === undefined
      ? this.db.prepare(`SELECT * FROM cases ORDER BY created_at DESC, rowid DESC LIMIT ?`).all(limit)
      : this.db
          .prepare(`SELECT * FROM cases WHERE owner_key_hash = ? ORDER BY created_at DESC, rowid DESC LIMIT ?`)
          .all(ownerKeyHash, limit)) as unknown as CaseRow[]
    return rows.map((r) => this.toCase(r))
  }

  /** Record the user's verdict on our output. Owner-scoped. */
  setFeedback(
    id: string,
    ownerKeyHash: string,
    feedback: "wrong" | "incomplete" | "right",
    note: string | null,
  ): boolean {
    const res = this.db
      .prepare(`UPDATE cases SET feedback = ?, feedback_note = ?, feedback_at = ? WHERE id = ? AND owner_key_hash = ?`)
      .run(feedback, note, CaseStore.nowIso(), id, ownerKeyHash)
    return Number(res.changes) > 0
  }

  /** Delete a case. Owner-scoped. */
  delete(id: string, ownerKeyHash?: string): boolean {
    const res =
      ownerKeyHash === undefined
        ? this.db.prepare(`DELETE FROM cases WHERE id = ?`).run(id)
        : this.db.prepare(`DELETE FROM cases WHERE id = ? AND owner_key_hash = ?`).run(id, ownerKeyHash)
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
   * Aggregate view for the operator: how is the product actually used?
   *
   * Counts only — no case contents, no identifiers, no addresses.
   */
  stats(): {
    totalCases: number
    withFeedback: number
    feedbackBreakdown: Record<string, number>
    totalCostUsdCents: number
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
      audience: (row.audience as Audience) ?? "private",
      feedback: (row.feedback as StoredCase["feedback"]) ?? null,
      feedbackNote: row.feedback_note,
      feedbackAt: row.feedback_at,
    }
  }
}

// Our own operational data — in its own database.
//
// It was in the case database, and that was a mistake of policy rather than
// of code. The two hold data with OPPOSITE retention rules and opposite
// audiences:
//
//   The cases are the USER's. They hold what we found about a SUBJECT, and
//   the subject's raw material expires on a TTL by design.
//
//   This is OURS. The waitlist is a contact list of people who asked to be
//   contacted. The usage events are coarse counters of how the product is
//   being used. We keep both, indefinitely.
//
// One file means one backup carries both policies, and one of them is wrong
// by the time the backup is restored. Two files, two audiences, two
// retentions.
//
// The addresses are stored as given. This is a contact list — not a marketing
// database, and not something to enrich.

import { DatabaseSync } from "node:sqlite"
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"

export interface WaitlistEntry {
  email: string
  source: string | null
  createdAt: string
}

export interface OperatorStoreOptions {
  /** Path to the SQLite file. ":memory:" for tests. */
  path: string
}

export class OperatorStore {
  private db: DatabaseSync

  constructor(opts: OperatorStoreOptions) {
    if (opts.path !== ":memory:") mkdirSync(dirname(opts.path), { recursive: true })
    this.db = new DatabaseSync(opts.path)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS waitlist (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        -- NOCASE: an address is an address whatever the case its owner typed.
        email      TEXT COLLATE NOCASE NOT NULL UNIQUE,
        source     TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS events (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        meta       TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_events_name ON events (name, created_at DESC);
    `)
  }

  /**
   * Join the waitlist. Returns false if the address is already on it.
   */
  addToWaitlist(email: string, source: string | null): boolean {
    const res = this.db
      .prepare(`INSERT OR IGNORE INTO waitlist (email, source, created_at) VALUES (?, ?, ?)`)
      .run(email, source, new Date().toISOString())
    return Number(res.changes) > 0
  }

  waitlistSize(): number {
    const row = this.db.prepare(`SELECT COUNT(*) AS n FROM waitlist`).get() as { n: number }
    return row.n
  }

  /** The entries themselves. Operator use only — never through the public API. */
  waitlistEntries(): WaitlistEntry[] {
    const rows = this.db.prepare(`SELECT email, source, created_at FROM waitlist ORDER BY created_at DESC`).all() as {
      email: string
      source: string | null
      created_at: string
    }[]
    return rows.map((r) => ({ email: r.email, source: r.source, createdAt: r.created_at }))
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
      .run(name, meta ? JSON.stringify(meta) : null, new Date().toISOString())
  }

  /** Counts per event name. */
  eventCounts(): Record<string, number> {
    const rows = this.db.prepare(`SELECT name, COUNT(*) AS n FROM events GROUP BY name`).all() as {
      name: string
      n: number
    }[]
    const out: Record<string, number> = {}
    for (const r of rows) out[r.name] = r.n
    return out
  }

  close(): void {
    this.db.close()
  }
}

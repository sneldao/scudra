// The case store, as a module singleton.
//
// The store is opened once per process. SQLite handles the concurrency; the
// only thing that must not happen is two processes writing the same file in
// ways SQLite cannot arbitrate, and one server is one process.
//
// If the store cannot be opened (read-only filesystem, missing directory),
// Blindspot still works — investigations run and produce reports, they just
// are not persisted. A product that refuses to work because its history
// cannot be written is worse than one that works and forgets.

import { CaseStore } from "../lib/store.js"
import { loadConfig } from "../lib/config.js"

let store: CaseStore | null = null
let attempted = false

export function getStore(): CaseStore | null {
  if (attempted) return store
  attempted = true
  try {
    const config = loadConfig()
    store = new CaseStore({ path: config.storePath, rawTtlHours: config.rawTtlHours })
    // Scrub expired raw material on boot — a process that was down for a
    // week should not come back holding a week-old dossier.
    const purged = store.purgeExpiredRaw()
    if (purged > 0) console.log(`[store] purged ${purged} case(s) whose raw material expired`)
  } catch (err) {
    console.error(`[store] disabled: ${(err as Error).message}`)
    store = null
  }
  return store
}

export function closeStore(): void {
  store?.close()
  store = null
  attempted = false
}

// The stores, as module singletons.
//
// The case store and the waitlist are separate objects with separate files
// and separate retention policies — see waitlist.ts for why.
//
// If a store cannot be opened (read-only filesystem, missing directory),
// Blindspot still works: investigations run and produce reports, they just
// are not persisted. A product that refuses to work because its history
// cannot be written is worse than one that works and forgets.

import { CaseStore } from "../lib/store.js"
import { OperatorStore } from "../lib/operator-store.js"
import { loadConfig } from "../lib/config.js"

let caseStore: CaseStore | null = null
let operatorStore: OperatorStore | null = null
let caseAttempted = false
let operatorAttempted = false

export function getCaseStore(): CaseStore | null {
  if (caseAttempted) return caseStore
  caseAttempted = true
  try {
    const config = loadConfig()
    caseStore = new CaseStore({ path: config.caseDbPath, rawTtlHours: config.rawTtlHours })
    // Scrub expired raw material on boot — a process that was down for a
    // week should not come back holding a week-old dossier.
    const purged = caseStore.purgeExpiredRaw()
    if (purged > 0) console.log(`[store] purged ${purged} case(s) whose raw material expired`)
  } catch (err) {
    console.error(`[store] case storage disabled: ${(err as Error).message}`)
    caseStore = null
  }
  return caseStore
}

export function getOperatorStore(): OperatorStore | null {
  if (operatorAttempted) return operatorStore
  operatorAttempted = true
  try {
    const config = loadConfig()
    operatorStore = new OperatorStore({ path: config.operatorDbPath })
  } catch (err) {
    console.error(`[store] waitlist disabled: ${(err as Error).message}`)
    operatorStore = null
  }
  return operatorStore
}

export function closeStores(): void {
  caseStore?.close()
  operatorStore?.close()
  caseStore = null
  operatorStore = null
  caseAttempted = false
  operatorAttempted = false
}

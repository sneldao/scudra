// @scudra/evidence — the verifiable-output primitives.
//
// Everything a Scudra experience asserts about itself reduces to four
// questions, and this package answers them:
//
//   1. Is this document the one I think it is?      → canonical()
//   2. Has anything been edited?                    → sha256 / canonicalHash()
//   3. Did Scudra produce this, and can a third
//      party check without trusting us?             → Ed25519 signing
//   4. Is every number here traceable to what was
//      actually observed?                           → checkGrounding()
//
// The experiences consume this package rather than each other, so a receipt
// produced by the Analyst and a receipt produced by Blindspot are verified by
// exactly the same code.

export { canonical, canonicalHash, sha256 } from "./canonical.js"
export { generateKeyPair, keyId, publicKeyFromPrivate, signDocument, verifyDocument } from "./signing.js"
export type { SigningKeyPair } from "./signing.js"
export { checkFigures, checkGrounding, extractNumbers } from "./grounding.js"
export type { Figure, FigureGrounding, Grounding } from "./grounding.js"
export { receiptBody, signReceipt, verifyReceipt } from "./receipt.js"
export type { Receipt, ReceiptBody, SignReceiptInput } from "./receipt.js"

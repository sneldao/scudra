# @scudra/evidence

The verifiable-output primitives. Everything a Scudra experience asserts about
itself reduces to four questions, and this package answers them.

| Question                                                                     | Answered by                           |
| ---------------------------------------------------------------------------- | ------------------------------------- |
| Is this document the one I think it is?                                      | `canonical()`                         |
| Has anything been edited?                                                    | `sha256` / `canonicalHash()`          |
| Did Scudra produce this, and can a third party check it without trusting us? | Ed25519 signing                       |
| Is every number here traceable to what was actually observed?                | `checkGrounding()` / `checkFigures()` |

The experiences consume this package rather than each other, so a receipt
produced by the Analyst and a receipt produced by Blindspot are verified by
exactly the same code.

## Why a package and not a folder

This started as two copies of a signing helper — an HMAC in the Analyst, and
a second idea in Blindspot that turned out to be better. Two copies of
security primitives is how they drift, and a receipt that verifies in one app
and not the other is worse than no receipt at all.

## What is in it

### `canonical.ts` — the byte-level agreement

Two systems that both hold the same document must agree on its byte
representation before they can agree on its hash or its signature. JSON key
order is not stable across serializers, so every field is sorted and every
value is encoded by type. Get this wrong and the signature verifies against a
different document than the one you meant to sign.

### `signing.ts` — asymmetric, on purpose

An HMAC proves "we produced this and nobody edited it", which is worthless to
someone who does not hold our key. Ed25519 proves the same thing to **anyone**,
using a public key we can publish. A finding can be handed to a journalist, a
regulator, or a bounty board and checked by anyone.

`publicKeyFromPrivate()` derives the public half from the private half, so a
deployment only has to configure one key and the two can never drift apart and
invalidate every receipt.

### `grounding.ts` — two kinds of grounding, for two kinds of report

**`checkGrounding()`** works on free text and is the right tool for a
model-written explanation: does every figure the model states appear in the
real output? It is deterministic — not another model call.

**`checkFigures()`** works on structured claims, and is what Blindspot's
verdicts use. A generic number scanner cannot tell a material figure from a
threshold (`<$10k liquidity`), a count, or a rounding constant — and it
silently ignores single digits. Worse, comparing magnitudes across a factor of
100 means a claimed `-50000` is "grounded" by a `50000` balance, which is
exactly wrong for money. So the author states each figure it relies on **by
metric name**, and the checker recomputes every metric from the raw records by
a separate path. Two independent computations agreeing is evidence; one
computation checking itself is tautology.

### `receipt.ts` — the durable half

A receipt binds _what was claimed_ to _what was actually observed_, with three
independent properties:

1. **Content** — the claims and observations are hashed, so any edit is detectable.
2. **Origin** — the signature is asymmetric, so a third party can check it
   against a published public key.
3. **Grounding** — the figures are checked against the observations they claim
   to come from, in code.

A signature alone proves nothing was edited _after_ signing. It does not prove
the contents were true when signed. Grounding is what closes that gap.

## Usage

```ts
import { generateKeyPair, keyId, signReceipt, verifyReceipt } from "@scudra/evidence"

const keys = generateKeyPair()

const receipt = signReceipt({
  id: "case-1",
  kind: "blindspot-investigation",
  claims: { target: "vitalik.eth", riskScore: 65 },
  observations: { metrics: { totalValueUSD: 144000 } },
  grounding: { checked: 2, grounded: 2, ungrounded: [] },
  privateKeyPem: keys.privateKeyPem,
  publicKeyPem: keys.publicKeyPem,
  keyId: keyId(keys.publicKeyPem),
})

// Anyone with the public key can check this.
verifyReceipt(receipt)
// → { signatureValid: true, contentIntact: true, grounded: true, valid: true }
```

`verifyReceipt(receipt, { strict: true })` additionally fails the receipt when
any claim is ungrounded — the setting for a receipt a third party is being
asked to rely on.

## Tests

```bash
pnpm --filter @scudra/evidence test
```

32 tests, covering key-order stability, type-sensitive encoding, the
percentage-scaling regression, tamper detection on every field, key
confusion, and malformed input that must not throw.

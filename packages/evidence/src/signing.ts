// Asymmetric signing for verifiable output.
//
// Blindspot's whole promise is that an investigator's conclusions survive even
// though their trail does not. That only means something if a third party can
// check the record without trusting the operator: the HMAC we used before
// proves "we produced this and nobody edited it", which is worthless to
// someone who does not hold our key.
//
// Ed25519 fixes that: the private key signs, the public key verifies, and the
// public key can be published. A finding can be handed to a journalist, a
// regulator, or a bounty board and checked by anyone.

import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto"
import { canonical } from "./canonical.js"

export interface SigningKeyPair {
  privateKeyPem: string
  publicKeyPem: string
}

/**
 * A short, stable identifier for a public key — the first 16 hex chars of the
 * hash of its DER encoding. Shown next to a signature so a reader can tell
 * which key signed it without holding the key itself.
 */
export function keyId(publicKeyPem: string): string {
  const der = createPublicKey(publicKeyPem).export({ type: "spki", format: "der" })
  return createHash("sha256").update(der).digest("hex").slice(0, 16)
}

export function generateKeyPair(): SigningKeyPair {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519")
  return {
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
  }
}

/**
 * Derive the public key from a private key.
 *
 * A deployment should only have to configure ONE key. The public half is
 * derived from the private half, so the two can never drift apart and
 * invalidate every receipt.
 */
export function publicKeyFromPrivate(privateKeyPem: string): string {
  return createPublicKey(createPrivateKey(privateKeyPem)).export({ type: "spki", format: "pem" }).toString()
}

/**
 * Sign a document. The signature covers the canonical encoding, so two
 * different key orders of the same object produce the same signature.
 */
export function signDocument(document: unknown, privateKeyPem: string): string {
  const key = createPrivateKey(privateKeyPem)
  return sign(null, Buffer.from(canonical(document), "utf8"), key).toString("base64")
}

/**
 * Verify a signature against a document using only the public key.
 *
 * Returns false — never throws — for malformed input. A verifier that can be
 * crashed by a bad signature is not a verifier.
 */
export function verifyDocument(document: unknown, signature: string, publicKeyPem: string): boolean {
  if (typeof signature !== "string" || signature.length === 0) return false
  try {
    const key = createPublicKey(publicKeyPem)
    const bytes = Buffer.from(signature, "base64")
    if (bytes.length === 0) return false
    return verify(null, Buffer.from(canonical(document), "utf8"), key, bytes)
  } catch {
    return false
  }
}

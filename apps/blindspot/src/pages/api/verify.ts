// POST /api/verify — check a receipt without trusting us.
//
// This is the endpoint that makes the whole thesis pay off. An investigator
// hands their finding to a bounty board, a journalist, or a regulator. The
// recipient asks: did Scudra produce this, has it been edited, and does the
// conclusion follow from the records?
//
// They ask THIS endpoint, not us. The public key is embedded in the receipt,
// so verification needs no secret and no account — it is a pure function of
// (receipt, public key).
//
// GET /api/verify — the public key, so a third party can fetch it once and
// verify offline.

import type { APIRoute } from "astro"
import { verifyReceipt, type Receipt } from "@scudra/evidence"
import { loadConfig } from "../../lib/config.js"

export const GET: APIRoute = async () => {
  const config = loadConfig()
  return json({
    publicKeyPem: config.publicKeyPem,
    keyId: config.signingKeyId,
    algorithm: "ed25519",
  })
}

export const POST: APIRoute = async ({ request }) => {
  let body: { receipt?: unknown }
  try {
    body = await request.json()
  } catch {
    return json({ valid: false, error: "Expected a JSON body." }, 400)
  }

  const receipt = body.receipt as Receipt | undefined
  if (!receipt || typeof receipt !== "object") {
    return json({ valid: false, error: "Missing receipt." }, 400)
  }

  // Verify against the key EMBEDDED in the receipt. A receipt that names its
  // own signer is self-describing: the reader can see who signed it and
  // decide whether to trust that signer. We do not silently substitute our
  // own key, because that would let anyone forge a "valid" receipt.
  const result = verifyReceipt(receipt)

  return json({
    valid: result.valid,
    signatureValid: result.signatureValid,
    contentIntact: result.contentIntact,
    grounded: result.grounded,
    signedBy: receipt.signedBy?.keyId ?? null,
    ungrounded: receipt.grounding?.ungrounded ?? [],
  })
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

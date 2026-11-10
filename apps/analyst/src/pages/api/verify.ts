// POST /api/verify { receipt } → { valid }.
//
// Recomputes the Ed25519 signature using the PUBLIC key, which is published
// at GET /api/verify. Any edit to any field of a receipt invalidates it.
//
// Because the key is public, a third party can fetch it once and verify
// receipts entirely offline — they never have to trust this server, and this
// server never has to hold a shared secret.
import type { APIRoute } from "astro"
import { loadConfig } from "../../lib/config.js"
import { verifyReceipt } from "../../lib/receipt.js"

export const GET: APIRoute = async () => {
  const config = loadConfig()
  return new Response(
    JSON.stringify({ publicKeyPem: config.receiptPublicKey, keyId: config.receiptKeyId, algorithm: "ed25519" }),
    { headers: { "content-type": "application/json" } },
  )
}

export const POST: APIRoute = async ({ request }) => {
  const config = loadConfig()
  let body: { receipt?: unknown }
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ valid: false }), {
      status: 400,
      headers: { "content-type": "application/json" },
    })
  }
  const valid = verifyReceipt(body.receipt as never, config.receiptPublicKey)
  return new Response(JSON.stringify({ valid }), { headers: { "content-type": "application/json" } })
}

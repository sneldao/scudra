// POST /api/verify { receipt } → { valid }. Recomputes the HMAC; any edit to
// any field of a receipt makes it invalid.
import type { APIRoute } from "astro"
import { loadConfig } from "../../lib/config.js"
import { verifyReceipt } from "../../lib/receipt.js"

export const POST: APIRoute = async ({ request }) => {
  const config = loadConfig()
  const secret =
    config.receiptSecret || (process.env.SCUDRA_MOCK === "1" ? "dev-only-receipt-secret-not-for-production" : "")
  let body: { receipt?: unknown }
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ valid: false }), {
      status: 400,
      headers: { "content-type": "application/json" },
    })
  }
  const valid = !!secret && verifyReceipt(body.receipt as never, secret)
  return new Response(JSON.stringify({ valid }), { headers: { "content-type": "application/json" } })
}

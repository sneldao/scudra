# Stealth Scraper — The Witness

Collect evidence from the web without leaving fingerprints.

## What it does

Uses a cloud browser with a residential proxy to scrape pages from different egress points. Captures screenshots and structured data without revealing the operator.

**The experience (planned): a live geo-diff.** The visitor enters a URL. The Witness fetches the same page from three or more residential locations (e.g., Frankfurt, Singapore, Iowa) and renders the responses side by side — price, language, content served, and what is blocked. In one screen, the visitor sees that the web is not one web, and that a witness agent who can appear from anywhere inspects it more fairly.

## Primitives

- Browser

## Why it matters

Some sites serve different content to different locations, or block datacenter IPs. A witness agent that can appear from anywhere is a fairer way to inspect the public web. The essay thesis: _the web is not one web — what geo-fencing means for agents._

## Solari foundation

- `examples/browser-stealth-proxy-ts`

## Status

**Code-complete, blocked, and parked as a lab artifact.** The experience app
is at [`apps/witness`](../../apps/witness) — CLI and web UI both work with a
`SOLARI_API_KEY`; the geo-diff engine and SSRF guard are unit-tested (15
tests). It cannot run live on the free Solari plan: stealth mode returns 402
`FeatureRequiresPlan`.

That is the same gate that blocks Blindspot's off-chain half, and the reason
**owning the browser primitive** is the top open item in
[`content/long-term-strategy.md`](../long-term-strategy.md). The Witness is a
great essay with a demo; it is not a business. It stays in the lab.

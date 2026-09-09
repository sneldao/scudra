# The Witness

Collect evidence from the web without leaving fingerprints.

## What it does

Uses a cloud browser with a residential proxy to scrape pages from different egress points. Captures screenshots and structured data without revealing the operator.

**The experience (planned): a live geo-diff.** The visitor enters a URL. The Witness fetches the same page from three or more residential locations (e.g., Frankfurt, Singapore, Iowa) and renders the responses side by side — price, language, content served, and what is blocked. In one screen, the visitor sees that the web is not one web, and that a witness agent who can appear from anywhere inspects it more fairly.

## Primitives

- Browser

## Why it matters

Some sites serve different content to different locations, or block datacenter IPs. A witness agent that can appear from anywhere is a fairer way to inspect the public web. The essay thesis: *the web is not one web — what geo-fencing means for agents.*

## Solari foundation

- `examples/browser-stealth-proxy-ts`

## Status

**In build.** The experience app is scaffolded at [`apps/witness`](../../apps/witness) —
CLI and web UI both work with a `SOLARI_API_KEY`; geo-diff engine and SSRF
guard are unit-tested. See [`content/roadmap.md`](../roadmap.md).

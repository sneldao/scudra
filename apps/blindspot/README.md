# Blindspot — Evidence gathering that leaves the investigator invisible

Investigate any onchain actor by ENS name, with the investigator's identity,
traffic, and history all protected by ephemeral sandboxes and stealth
browsers — and get back a verdict you can keep, share, and have checked.

**This is Scudra's product.** The lab is the funnel; this is the thing people
pay for. See [`content/long-term-strategy.md`](../../content/long-term-strategy.md).

## The privacy inversion

Most privacy projects protect the **subject** — the person being looked at.
Blindspot protects the **investigator** — the person looking.

> "I want to research wallet X without wallet X, my ISP, Mobula, or anyone
> else knowing I looked."

Three layers of metadata are protected:

| Layer    | What's protected                  | Mechanism                                                          |
| -------- | --------------------------------- | ------------------------------------------------------------------ |
| **Who**  | Investigator's IP and fingerprint | Solari stealth browser + residential proxy                         |
| **That** | That an investigation occurred    | Ephemeral sandbox, killed after, no persistent state               |
| **What** | What onchain data was queried     | Mobula API calls run inside the sandbox, not the investigator's IP |

## The other half: your evidence persists

The infrastructure leaves no trace. **Your findings do not** — and that is the
design, not an oversight.

| Data                          | Lifetime                                      |
| ----------------------------- | --------------------------------------------- |
| The subject's raw material    | **Expires** — short TTL, purged automatically |
| The verdict, signals, sources | **Persists** until you delete the case        |
| The signed receipt            | **Persists** — verifiable by anyone           |

An investigator who cannot keep their findings has not bought anything. And a
user who cannot delete what they gathered is carrying a liability. Both are
one click away.

## The signed receipt

Every case ends in a receipt: what was claimed, what was observed, and a
signature over the two.

Three independent properties, and it matters that they are independent:

1. **Content** — the claims and observations are hashed, so any edit is detectable.
2. **Origin** — the signature is Ed25519, and the **public key is published**
   at `GET /api/verify`. A third party can check the receipt without a
   secret and without trusting us.
3. **Grounding** — every figure the verdict relies on is recomputed from the
   raw records by an independent path and compared. A figure that cannot be
   confirmed is **flagged, not hidden**.

The signature alone proves nothing was edited _after_ signing. It does not
prove the contents were true when signed. Grounding is what closes that gap.

The primitives live in [`packages/evidence`](../../packages/evidence) and are
shared with The Analyst, so a receipt from either experience is verified by
the same code.

## How ENS is load-bearing

ENS is not cosmetic here. It is the discovery and enrichment layer:

- **Discovery**: the investigator queries by ENS _name_, not raw address. The
  name resolves to the target.
- **Enrichment signals**: ENS text records (website, Twitter, GitHub, avatar,
  description) drive the off-chain context the stealth browser fetches.
- **Identity correlation**: reverse lookup catches aliases — multiple names on
  one address is a signal worth surfacing in the risk assessment.

## How Mobula is load-bearing

Mobula powers the onchain analysis layer:

- **Portfolio**: holdings, balances, USD values across chains
- **Positions with PnL**: realized and unrealized gains/losses per token
- **Trade history**: buy/sell counts, volumes, activity timestamps

All Mobula API calls execute from **inside the ephemeral sandbox** — Mobula
sees the sandbox's ephemeral IP, not the investigator's.

## Architecture

```
Browser ──HTTPS──▶ Astro SSR app (the control plane)
                     │
                     ├─ ENS resolution ─────▶ public Ethereum RPC
                     ├─ Mobula calls ───────▶ inside the ephemeral sandbox
                     ├─ off-chain context ──▶ stealth browser + residential proxy
                     ├─ risk assessment ────▶ deterministic rules (no LLM)
                     ├─ signed receipt ─────▶ Ed25519 + grounding check
                     └─ case store ─────────▶ SQLite (the user's evidence)
```

## What a user gets

- **One field.** Paste an ENS name, get a verdict. No sample data in the
  primary path, no suggested prompts.
- **Their cases.** Every investigation is saved, listed, and reopenable.
- **Export.** JSON for scripts and archives; a printable HTML report for
  people.
- **Cost, shown.** What the investigation cost, in the UI.
- **A way to say we were wrong.** One click — the cheapest research loop
  there is, and the only one that tells us what to build next.
- **Delete.** Their case, their call.

## Run it

```bash
pnpm install
cp apps/blindspot/.env.example apps/blindspot/.env
pnpm --filter @scudra/blindspot dev

# CLI
pnpm --filter @scudra/blindspot cli vitalik.eth
```

Keys needed: `SOLARI_API_KEY` (sandbox + stealth browser), `MOBULA_API_KEY`
(onchain data). The receipt signing key is optional — without it an ephemeral
key is generated, which works but cannot be verified by a third party.

## API

| Endpoint                        | What it does                                  |
| ------------------------------- | --------------------------------------------- |
| `GET /api/investigate?name`     | SSE stream of the investigation               |
| `GET /api/cases`                | The user's cases, newest first                |
| `GET /api/cases/[id]`           | One case in full                              |
| `DELETE /api/cases/[id]`        | The user deletes their own evidence           |
| `POST /api/cases/[id]/feedback` | `wrong` / `incomplete` / `right`, plus a note |
| `GET /api/cases/[id]/export`    | JSON or HTML export, receipt included         |
| `GET /api/verify`               | The public key                                |
| `POST /api/verify`              | Check a receipt — no secret, no account       |
| `POST /api/waitlist`            | Join the waitlist                             |
| `POST /api/analytics`           | First-party usage events                      |
| `GET /api/stats`                | The operator's view of how it is being used   |

`DELETE` is protected by Astro's origin check: a same-origin request works, a
cross-site one is refused. The `POST` endpoints take JSON and are CORS-open so
the site can post to them.

## Deploy

The app is an Astro SSR build with a Node adapter — there is no Vite-only
output to host, just a server.

```bash
pnpm --filter @scudra/blindspot build
cd apps/blindspot && node dist/server/entry.mjs
```

What a deployment needs:

- `SOLARI_API_KEY` and `MOBULA_API_KEY` — without them the API returns a
  clear "not configured" message rather than failing silently.
- `BLINDSPOT_STORE_PATH` — where the SQLite file lives. **Put it on a
  persistent volume**; the default is `data/blindspot.db` relative to the
  working directory, and a case store that vanishes on redeploy is a case
  store nobody can come back to.
- `BLINDSPOT_SIGNING_KEY` — the Ed25519 private key. Without it an ephemeral
  key is generated at boot: the app works, but receipts cannot be verified by
  a third party and the key changes on every restart.
- `BLINDSPOT_RAW_TTL_HOURS` — how long the subject's raw material survives.
  Defaults to 24 hours.
- `BLINDSPOT_OPERATOR_KEY` — if set, `/api/stats` requires it in the
  `x-operator-key` header.

Put it behind Caddy or nginx for TLS and SSE-safe buffering, and give the
process a writable data directory.

## Honest limits

- The risk assessment is **deterministic rules, not a model**. It is
  transparent and reproducible, and it is also shallow — it looks for known
  patterns (concentration, losses, liquidity, buy-only positions, aliasing)
  and cannot tell you what it does not know.
- The receipt proves the record is ours and unmodified, and that its figures
  match an independent recomputation. It does not prove the underlying data
  provider was honest.
- The subject's raw material is held for a short TTL and then purged. That is
  a mitigation, not a guarantee against a subpoena.
- The Solari free plan does not include stealth mode (it returns 402
  `FeatureRequiresPlan`), so the off-chain half of an investigation needs a
  paid plan or our own browser primitive. See
  [`content/long-term-strategy.md`](../../content/long-term-strategy.md) §2.2.

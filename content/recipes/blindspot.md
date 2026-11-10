# Blindspot — The Investigator

Evidence gathering that leaves the investigator invisible.

**Status: live, and it is the product.** Not a recipe — the thing people
actually use. See [`content/long-term-strategy.md`](../long-term-strategy.md).

## What it does

1. Resolves an ENS name to an address using a public RPC.
2. Spawns a Solari sandbox and fetches onchain portfolio data from Mobula inside it.
3. Spawns a Solari stealth browser and enriches off-chain context through a residential proxy.
4. Analyzes combined signals into a risk score with deterministic rules.
5. Recomputes every figure the verdict relies on, from the raw records, by an independent path — and flags anything it cannot confirm.
6. Signs the result: an Ed25519 receipt over the claims and the observations, with the public key published.
7. Saves the case — the user's evidence persists, the subject's raw material expires on a TTL.
8. Tears everything down: sandbox killed, browser closed, state removed.

## Primitives

- Sandbox
- Browser

## Why it matters

Most privacy projects protect the subject. Blindspot protects the investigator: the person looking.

But that is only half the story, and the half that makes it a product rather
than a demo. The infrastructure leaves no trace; **the user's findings
persist**. An investigator who cannot keep their conclusions has not bought
anything — and a user who cannot delete what they gathered is carrying a
liability. Both are one click away.

The third half is **checkability**. The signature is asymmetric and the public
key is published, so a bounty board, a journalist or a regulator can verify a
receipt without a secret and without trusting us. And grounding means the
figures in the verdict are not a model's opinion: they are recomputed from the
records.

## Run it

```bash
cd apps/blindspot
pnpm install
cp .env.example .env
# add SOLARI_API_KEY and MOBULA_API_KEY
pnpm dev
```

Then open http://localhost:4567 and investigate an ENS name. The 3D dossier
lives at `/dossier`.

Full API and operational notes: [`apps/blindspot/README.md`](../../apps/blindspot/README.md).

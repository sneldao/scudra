# Blindspot

A privacy-preserving onchain investigation agent.

## What it does

1. Resolves an ENS name to an address using a public RPC.
2. Spawns a Solari sandbox and fetches onchain portfolio data from Mobula inside it.
3. Spawns a Solari stealth browser and enriches off-chain context through a residential proxy.
4. Analyzes combined signals into a risk score.
5. Generates a self-contained HTML report with a privacy manifest.
6. Tears everything down: sandbox killed, browser closed, state removed.

## Primitives

- Sandbox
- Browser

## Why it matters

Most privacy projects protect the subject. Blindspot protects the investigator: the person looking.

## Run it

```bash
cd apps/blindspot
pnpm install
cp .env.example .env
# add SOLARI_API_KEY and MOBULA_API_KEY
pnpm dev
```

Then open http://localhost:4567 and investigate an ENS name.

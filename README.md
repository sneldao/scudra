# Scudra

A lab for cloud-native agents.

**Scudra** is a collection of real-world recipes, experiences, and thought leadership for browsers, sandboxes, and desktops that run in the cloud.

It is built on [Solari](https://getsolari.com), the platform that unifies cloud browsers, sandboxes, and desktops behind one API.

## Why cloud agents?

The next shift in software is not bigger models. It is smaller, cloud-native agents.

A cloud agent is a program whose body is infrastructure: a browser in Frankfurt, a sandbox in Iowa, a desktop in Singapore. It starts with an API call and leaves no persistent state behind. This makes it the right shape for competitive research, sensitive automation, and any task where the operator's identity, location, or history must not leak.

## The three primitives

- **Browser** — A web agent that can see, click, and navigate without touching your local machine.
- **Sandbox** — A disposable VM that boots in seconds, runs code, and is destroyed when the work is done.
- **Desktop** — A remote GUI for tasks that require a screen: click, type, and observe like a human.

## Featured experience

- **[Blindspot](apps/blindspot)** — Privacy-preserving onchain investigation. Look up an ENS name and watch an agent quietly investigate it, then receive a verdict — all from a disposable cloud machine that leaves no trace.

## Repository structure

```
scudra/
├── apps/
│   ├── site/        # Main site: manifesto, recipes, experiences
│   ├── blindspot/   # Flagship interactive experience
│   └── witness/     # The Witness: live geo-diff experience
├── packages/
│   └── shared/      # Design tokens and shared UI
├── content/         # Long-form writing and recipe source material
└── examples/        # Original Solari cookbook examples
```

## Quick start

```bash
# Install dependencies (also installs git hooks via the prepare script)
pnpm install

# Start the main site
pnpm dev:site

# In another terminal, start the Blindspot experience
pnpm dev:blindspot

# Or the Witness geo-diff experience
pnpm dev:witness
```

## Development

```bash
pnpm typecheck      # TypeScript across all packages
pnpm lint           # ESLint (TypeScript + React hooks rules)
pnpm test           # Unit tests (Vitest)
pnpm format         # Prettier across the repo
```

Git hooks (gitleaks secret scan, ruff, tsc) are symlinked by
`scripts/install-hooks.sh`, which runs automatically on `pnpm install`.
Run it manually if the hooks change: `bash scripts/install-hooks.sh`.

## The Cloud Agent Manifesto

Read the full manifesto in [`content/manifesto.md`](content/manifesto.md) or at `/manifesto` once the site is running.

## Recipes

Each recipe is a real, runnable agent:

- [Blindspot](content/recipes/blindspot.md)
- [The Witness](content/recipes/stealth-scraper.md)
- [Code Interpreter — The Analyst](content/recipes/code-interpreter.md)
- [Desktop Operator — The Controller](content/recipes/desktop-operator.md)
- [Browser Profiles — The Chameleon](content/recipes/browser-profiles.md)
- [Session Recording — The Archivist](content/recipes/the-archivist.md)
- [The Builder](content/recipes/the-builder.md)

See [`content/roadmap.md`](content/roadmap.md) for the full operating plan:
the characters, the thesis, the sequencing, and the publishing formula.

## Built for

Scudra is an exploration of what cloud agents can do. It was built as a response to the Pinetree Research / Solari engineering challenge: fork the Solari cookbook, build a real use case, and publish it.

Use AI to build it? We did. The whole thing is public.

## Links

- Site — https://scudra.dev
- Solari — https://getsolari.com
- Solari Docs — https://docs.getsolari.com

MIT licensed.

# The Analyst — Blast Radius Zero

An agent that executes — safely. Ask a question in plain English; a model on
**Vultr Serverless Inference** writes Python; the code runs inside a
throwaway, locked-down container on a **Vultr Cloud Compute** VM; the _real_
stdout comes back, errors are fed to the model for self-repair, and the
container is destroyed and verified gone.

Built for the **Vultr: Agent Rush** hackathon — Challenge 1, _Blast Radius Zero_
(Pattern A: sandboxed code execution).

## The product (what a visitor sees)

1. **Pick data** — three built-in datasets, a CSV upload (checked before it leaves the browser), or no data at all.
2. **Ask** — a question, or one of the suggested prompts. ⌘↵ runs it.
3. **Watch the pipeline** — Boot → Write → Run → Explain → Destroy. If the code fails, the rail loops back to Write and says *self-repairing*.
4. **The machine panel** stays on screen the whole time: age, hard limits, and a verdict that says **Contained** only when teardown was verified and nothing escaped.
5. **The answer** — large type, chart underneath with its sha256, a verifier line (a second model judges whether the output actually answers the task), and a grounding line: every number in the prose is checked against the real stdout. Figures that don't appear are flagged.
6. **Cancel** — stops the stream; the server destroys the sandbox in a `finally`. The UI does not claim "contained" until a verified teardown comes back.
7. **Attack the sandbox** — seven hostile programs, no model required. A BLOCKED stamp and the real error for each.
8. **Receipt** — hashes + HMAC. *Forge it & verify* edits a field and shows the signature fail.

Keyboard, contrast (WCAG AA), landmarks and reduced motion are checked with axe in CI-style browser runs. Mock mode (`pnpm dev:analyst:mock`) runs the entire product with a scripted model and sandbox.

## How Vultr powers it

| Piece                                                      | Vultr service                                                                           |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Control plane (Astro SSR app, orchestrator, SSE streaming) | **Vultr Cloud Compute** VM                                                              |
| Agent LLM calls (code generation, retry, explanation)      | **Vultr Serverless Inference** (`https://api.vultrinference.com/v1`, OpenAI-compatible) |
| Sandbox runtime                                            | Docker **on the same Vultr VM**, one container per task                                 |

Vultr is the center of control. Nothing in the default or demo path touches
another cloud.

```
 Browser ──HTTPS──▶ Vultr VM (control plane, holds ALL secrets)
                       │  1. prompt ───────────────▶ Vultr Serverless Inference
                       │  ◀─────────────── python ──┘
                       │  2. docker run (no net, no secrets, capped)
                       │  3. code over stdin ─▶ ┌────────────────────┐
                       │  ◀── real stdout ───── │ sandbox container  │
                       │  4. errors fed back    └────────────────────┘
                       │  5. verifier judges the result, model explains
                       │  6. docker rm -f  +  docker inspect (must fail) = verified gone
                       ▼
                  SSE event stream → live timeline
```

## Containment (the point of the project)

Enforced by the host at `docker run` (`src/lib/providers/docker.ts`), not by
the code inside — and pinned by unit tests on the exact flags:

- **Process isolation** — own namespaces; app runtime and host FS never mounted; Docker socket never exposed.
- **No network** — `--network none`: no egress, no DNS, no cloud metadata endpoint.
- **Secret hygiene** — no `--env`, no volumes. Keys live only on the control plane; the sandbox has nothing to steal.
- **Least privilege** — `--cap-drop ALL`, `no-new-privileges`, non-root user, read-only root FS, `noexec` RAM-only scratch.
- **Resource limits** — 512 MB memory (swap off), 1 CPU, 64 PIDs, 15 s per run, 120 s lifetime backstop (`sleep` self-exits, `--rm`).
- **Lifecycle discipline** — fresh container per task, destroyed in a `finally` on every path, then **verified** (`docker inspect` must fail). Orphans from a crashed control plane are reaped (labelled) on next start.
- **Untrusted output** — artifacts are allowlisted (png/csv/txt/json), PNG magic-checked, name-validated, size-capped. No SVG/HTML.
- **Admission control** — max concurrent sandboxes (503 with a clear message when full), per-IP rate limit, bounded task/data/output sizes.

### Two independent checks on the answer

Before the model explains, a **verifier pass** (`src/lib/verify.ts`) — a second
model call, optionally a different model family via `VULTR_INFERENCE_VERIFY_MODEL`
— judges whether the executed program's real output actually answers the task.
It returns PASS / FAIL / UNCERTAIN with a one-line reason, which is shown in the
UI and signed into the receipt. The deterministic grounding check then polices
figures in the prose. A verifier outage degrades to UNCERTAIN, never a silent
pass.

### Verifiable output: signed receipts

Every run ends with a receipt: sandbox id, image, model, limits, timestamps,
whether destruction was verified, attempts, exit code, and SHA-256 of the code,
stdout, dataset and every artifact — signed with an HMAC held only on the
control plane. `POST /api/verify` re-checks it; the UI's _Forge it & verify_
button edits a field and shows verification fail. (HMAC proves the record is
ours and unmodified; it is not third-party attestation — see Honest limits.)

### The containment moment: "Attack the sandbox ⚡"

One click runs seven hostile programs in a real sandbox and shows the real
evidence: steal env secrets, phone home, read `/etc/shadow` and the Docker
socket, write to the system FS, fork bomb, allocate 2 GB, infinite loop.
Each gets a BLOCKED/ESCAPED stamp; the sandbox is then destroyed and verified
gone. It needs no LLM, so it works even if inference is down.

## Run it

```bash
pnpm install

# 1. No Docker, no key (scripted model + sandbox; the UI shows a banner)
pnpm dev:analyst:mock                             # http://localhost:4570

# 2. Real, on a machine with Docker (the Vultr VM)
docker build -t scudra-sandbox:latest apps/analyst/sandbox
cp apps/analyst/.env.example apps/analyst/.env    # key, model, RECEIPT_SECRET
pnpm --filter @scudra/analyst cli --doctor        # checks Docker, image, keys
pnpm --filter @scudra/analyst cli --probe         # 7/7 BLOCKED on real Docker
pnpm dev:analyst

# headless
pnpm --filter @scudra/analyst cli --csv data.csv "average salary per department"
pnpm --filter @scudra/analyst test     # 88 tests: docker flags, fake-docker lifecycle, llm retries, grounding, verifier, reducer
```

## Deploy on Vultr

Verified working configuration (deployed 2026-11):

- **Live demo:** https://scudra.persidian.com — `vc2-1c-1gb` (1 vCPU / 1 GB), Los Angeles, ~$0.01/hr.
  On 1 GB, set `MAX_CONCURRENT_SANDBOXES=1` — each sandbox is capped at 512 MB.

1. Create a **Cloud Compute** VM (Ubuntu 24.04; `vc2-1c-1gb` is sufficient — 2 vCPU / 4 GB only if you expect concurrent judges).
2. `scp apps/analyst/deploy/setup-vultr.sh root@VM:` and run it (Docker, Node, pnpm, firewall, `scudra` user). Then copy your SSH key into `/home/scudra/.ssh/authorized_keys` if you want to log in as `scudra`.
3. As `scudra`: clone, build the sandbox image, create `.env` (`TRUST_PROXY=1`), `pnpm install && pnpm build:analyst`.
4. Gate: `cli --doctor` all ✓, then `cli --probe` 7/7 BLOCKED. Do not go public until both pass.
5. `deploy/scudra-analyst.service` → systemd; `deploy/Caddyfile` → HTTPS (SSE-safe). No domain? `<ip>.sslip.io` works with Let's Encrypt.

> **Important:** run the app directly on the VM, not inside a container with
> `/var/run/docker.sock` mounted — that would give the app root on the host.

## Sandbox providers

`src/lib/providers/types.ts` defines the lifecycle contract (create with hard
limits → exec → idempotent, verifiable destroy). `vultr-docker` is the only
provider shipped and the only one used in the demo. Others (a throwaway
Vultr instance via the Vultr API, or Solari) plug in behind
`SANDBOX_PROVIDER` by implementing the same interface.

## Honest limits

Docker containers share the host kernel. This is strong against accidental and
casual abuse and defeats every probe above, but it is not a hardware boundary. Receipts use a shared-secret HMAC: tamper-evident for whoever holds the key, not third-party attestation (that needs asymmetric signing). The verifier is a model, not a proof — it can be wrong, which is why UNCERTAIN exists and why its verdict is signed into the receipt rather than treated as ground truth.
For hostile multi-tenant production use, run with **gVisor** (`--runtime=runsc`)
or a throwaway Vultr VM per task — the provider seam is built for that.

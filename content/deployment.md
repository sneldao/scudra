# Deployment — Scudra on Vultr

**One box, three hosts, three roles.**

The roles are the point: the **product** and the **lab artifacts** must never
be confusable, because a visitor arriving at the domain should find the thing
people actually use.

| Host                             | Serves                | Role                   |
| -------------------------------- | --------------------- | ---------------------- |
| `scudra.persidian.com`           | Blindspot (`:4567`)   | **The product**        |
| `analyst.149.248.9.254.sslip.io` | The Analyst (`:4570`) | Lab artifact           |
| `lab.149.248.9.254.sslip.io`     | The lab site (static) | Lab artifact           |
| `149.248.9.254.sslip.io`         | The Analyst (`:4570`) | The no-domain fallback |

> **The facts about the live box — which host, what it costs, where the keys
> are, and what is currently broken — are in
> [`sneldao/scudra-internal`](https://github.com/sneldao/scudra-internal),
> which is private.** This document carries the shape and the reasons. The
> split is deliberate: git history is permanent and forkable, so anything
> removed from a public repo later was public all along. Internal material
> does not get redacted from a public repository; it lives elsewhere from the
> start.

### Why the sslip.io hosts

`persidian.com` is on Cloudflare nameservers, and the wildcard records for it
do not exist yet. `sslip.io` resolves **any** label to the IP in its name, and
Let's Encrypt issues for it — so the lab artifacts are reachable today with no
DNS change at all.

When the Cloudflare records are added, the fix is two hostnames in
`apps/site/deploy/Caddyfile` and nothing else. The app code does not care: it
reads its URLs from `DEPLOY` in `packages/shared`.

---

## The shape on the box

```
/home/scudra/scudra/           the repo, checked out, built in place
  apps/analyst/dist/           the built Analyst
  apps/blindspot/dist/         the built Blindspot
  apps/site/dist/              the built lab site
/var/lib/scudra/blindspot/     Blindspot's working directory
  data/cases.db                THE CASE STORE — the user's evidence
  data/operator.db             our own data: waitlist + usage counters
  reports/                     generated investigation reports
/var/www/scudra-lab/           the lab site, served from disk by Caddy
/etc/scudra/*.pem              the receipt signing keys
```

**The case store is on `/var/lib`, not `/home`.** The systemd unit runs with
`ProtectSystem=strict`, which makes the whole filesystem read-only except for
named paths. A store under `/home` would be lost on redeploy, and the whole
point of the store is that a user's evidence survives.

**Two databases, two audiences.** The cases are the USER's documents, and the
subject's raw material expires on a TTL. The operator database is OURS — the
waitlist is a contact list of people who asked to be contacted, kept
indefinitely, and the usage counters are coarse. One file would mean one
backup carrying both policies, and one of them is wrong by the time the backup
is restored.

---

## Services

```bash
systemctl status scudra-blindspot scudra-analyst caddy
journalctl -u scudra-blindspot -f
systemctl restart scudra-blindspot scudra-analyst
```

### scudra-blindspot.service (the product)

- `WorkingDirectory=/var/lib/scudra/blindspot` — so the SQLite store and the
  reports land on the persistent path.
- `ReadWritePaths=/var/lib/scudra/blindspot` — the single writable exception
  under `ProtectSystem=strict`.
- `EnvironmentFile=…/apps/blindspot/.env`.

### scudra-analyst.service (lab artifact)

- `ProtectHome=read-only` — the analyst writes nothing.
- `MAX_CONCURRENT_SANDBOXES=1` on a small box: each sandbox is capped at
  512 MB, and two will not fit.

---

## Environment

### The Analyst

```
VULTR_INFERENCE_API_KEY=…
VULTR_INFERENCE_MODEL=glm-5.3-flash
VULTR_INFERENCE_VERIFY_MODEL=deepseek-v4.1-flash-1017
RECEIPT_SIGNING_KEY_FILE=/etc/scudra/analyst-key.pem
RECEIPT_PUBLIC_KEY_FILE=/etc/scudra/analyst-key.pub.pem
```

### Blindspot

```
SOLARI_API_KEY=…
MOBULA_API_KEY=…
BLINDSPOT_CASE_DB=/var/lib/scudra/blindspot/data/cases.db
BLINDSPOT_OPERATOR_DB=/var/lib/scudra/blindspot/data/operator.db
BLINDSPOT_RAW_TTL_HOURS=24
BLINDSPOT_SIGNING_KEY_FILE=/etc/scudra/blindspot-key.pem
BLINDSPOT_PUBLIC_KEY_FILE=/etc/scudra/blindspot-key.pub.pem
BLINDSPOT_OPERATOR_KEY=…
```

---

## The receipt signing key — read this before changing it

**The key lives in a FILE, not in an environment variable, and that is not a
style choice.**

A PEM is multi-line. To put one in an environment variable you have to escape
the newlines as `\n` — and **systemd's `EnvironmentFile` parser consumes the
backslash**, leaving a bare `n`:

```
-----BEGIN PUBLIC KEY-----nMCowBQYDK2VwAyEA...n-----END PUBLIC KEY-----
```

which is not a PEM. The symptom is an opaque `DECODER routines::unsupported`
from inside node's crypto, several layers from the cause, and it is not
recoverable in the app: the value is already corrupted before the process sees
it.

So the key is a file. `/etc/scudra` is `root:scudra` mode `750`; the keys
themselves are `scudra:scudra` mode `600`.

The public key is published at `GET /api/verify` on both apps, so a receipt
can be checked by anyone who fetches it — with no secret and no account.

---

## Astro needs `security.allowedDomains` behind a proxy

Astro's CSRF origin check compares the browser's `Origin` header against the
request's own origin. Behind a TLS-terminating proxy the upstream connection
is plain http, so Astro sees `http://scudra.persidian.com` while the browser
sends `https://scudra.persidian.com` — and calls it cross-site.

The symptom is subtle and total: the request is rejected before any of it
runs, so the **delete button never worked**. Astro only honours
`X-Forwarded-Proto` when `security.allowedDomains` is configured, so both apps
set it — with the public hostname plus localhost for development. It doubles
as a host-header-injection guard: a crafted `X-Forwarded-Host` that matches no
pattern is ignored and the request's own host is used instead.

---

## Deploying

```bash
ssh <the box> scudra@<host>
cd /home/scudra/scudra
git pull --ff-only origin main
pnpm install
pnpm build
sudo cp -r apps/site/dist/. /var/www/scudra-lab/
sudo systemctl restart scudra-blindspot scudra-analyst
```

Then check:

```bash
curl -s https://scudra.persidian.com/api/verify            # the product's public key
curl -s https://scudra.persidian.com/api/cases             # {"cases":[],"persisted":true}
```

**Restart both services after every deploy.** `pnpm build` is turbo-cached,
and a service left running serves the old bundle — which looks exactly like a
routing bug and is not.

---

## Two things this deployment cannot do

1. **Blindspot cannot run an investigation without `MOBULA_API_KEY`.** The
   onchain data comes from Mobula. The API says so by name: _"This server is
   missing MOBULA_API_KEY — the operator needs to configure it before
   investigations can run."_ Everything else works: the store, the receipt, the
   export, the waitlist, the analytics.
2. **The off-chain half of Blindspot degrades.** A stealth browser session
   needs a paid plan; on the free tier the investigation continues with the
   onchain data only and says what it could not collect. Fixing that properly
   means owning the browser primitive — see
   [`long-term-strategy.md`](long-term-strategy.md) §2.2.

---

## Access control, in one paragraph

Each browser gets an **owner key** on first use, in an httpOnly cookie. Only
its SHA-256 fingerprint is stored, and every case read, export, feedback and
delete is scoped to it — so an id alone is not authorisation, and the list is
filtered too. A case that exists but is not yours is reported as _missing_,
not _forbidden_: "forbidden" would confirm the id is real, which is information
a stranger should not get for free. There are no accounts yet — clearing
cookies loses access, which is why the export exists and why it is the thing
to keep. The **receipt** is the opposite: publishable by design, signed, and
checkable by anyone with the public key.

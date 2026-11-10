# Deployment — Scudra on Vultr

**Host:** `149.248.9.254` (Vultr Cloud Compute, `vc2-1c-1gb`, Los Angeles, ~$0.01/hr)
**OS:** Ubuntu 24.04 · Docker 29 · Node 22 · pnpm 9.15 · Caddy 2.11.9

---

## The shape of it

One box, three hosts, three roles. The roles are the point: the **product** and
the **lab artifacts** must never be confusable, because a visitor arriving at
the domain should find the thing people actually use.

| Host                             | Serves                       | Role                            |
| -------------------------------- | ---------------------------- | ------------------------------- |
| `scudra.persidian.com`           | Blindspot (`:4567`)          | **The product**                 |
| `analyst.149.248.9.254.sslip.io` | The Analyst (`:4570`)        | Lab artifact                    |
| `lab.149.248.9.254.sslip.io`     | The lab site (static, `:80`) | Lab artifact                    |
| `149.248.9.254.sslip.io`         | The Analyst (`:4570`)        | The original no-domain fallback |

### Why the sslip.io hosts

`persidian.com` is on Cloudflare nameservers, and the wildcard records for it
do not exist yet. `sslip.io` resolves **any** label to the IP in its name, and
Let's Encrypt issues for it — so the lab artifacts are reachable today with no
DNS change at all.

When the Cloudflare records are added (`analyst.persidian.com` and
`lab.persidian.com` → `149.248.9.254`), the fix is two hostnames in
`apps/site/deploy/Caddyfile` and nothing else. The app code does not care: it
reads its URLs from `DEPLOY` in `packages/shared`.

### What is NOT here

The Witness and The Builder are not deployed. The Witness needs a paid Solari
plan for stealth mode (402 `FeatureRequiresPlan`), and The Builder was
verified live but is a lab artifact with no product value. They live in the
lab as recipes.

---

## Layout on the box

```
/home/scudra/scudra/           the repo, checked out, built in place
  apps/analyst/dist/           the built Analyst
  apps/blindspot/dist/         the built Blindspot
  apps/site/dist/              the built lab site
/var/lib/scudra/blindspot/     Blindspot's working directory
  data/blindspot.db            THE CASE STORE — persistent, not in /home
  reports/                     generated investigation reports
/var/www/scudra-lab/           the lab site, served from disk by Caddy
/etc/scudra/*.pem              the receipt signing keys
```

**The case store is on `/var/lib`, not `/home`.** The systemd unit runs with
`ProtectSystem=strict`, which makes the whole filesystem read-only except for
named paths. A store under `/home` would be lost on redeploy, and the whole
point of the store is that a user's evidence survives.

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
- `MAX_CONCURRENT_SANDBOXES=1` on a 1 GB box: each sandbox is capped at
  512 MB, and two would not fit.

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
MOBULA_API_KEY=…            ← MISSING. The product cannot run without it.
BLINDSPOT_STORE_PATH=/var/lib/scudra/blindspot/data/blindspot.db
BLINDSPOT_RAW_TTL_HOURS=24
BLINDSPOT_SIGNING_KEY_FILE=/etc/scudra/blindspot-key.pem
BLINDSPOT_PUBLIC_KEY_FILE=/etc/scudra/blindspot-key.pub.pem
```

---

## The receipt signing key — read this before changing it

**The key lives in a FILE, not in an environment variable, and that is not a
style choice.**

A PEM is multi-line. To put one in an environment variable you must escape
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

To rotate:

```bash
ssh -i ~/.ssh/scudra-vultr root@149.248.9.254
node -e "const fs=require('fs');const {generateKeyPairSync}=require('crypto');
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
fs.writeFileSync('/etc/scudra/analyst-key.pem',privateKey.export({type:'pkcs8',format:'pem'}).toString());
fs.writeFileSync('/etc/scudra/analyst-key.pub.pem',publicKey.export({type:'spki',format:'pem'}).toString());"
chown scudra:scudra /etc/scudra/*.pem && chmod 600 /etc/scudra/*.pem
systemctl restart scudra-analyst
```

The public key is published at `GET /api/verify` on both apps, so a receipt
can be checked by anyone who fetches it.

---

## Deploying

```bash
ssh -i ~/.ssh/scudra-vultr scudra@149.248.9.254
cd /home/scudra/scudra
git pull --ff-only origin main
pnpm install
pnpm build
# copy the lab site out to Caddy's document root
sudo cp -r apps/site/dist/. /var/www/scudra-lab/
sudo systemctl restart scudra-blindspot scudra-analyst
```

Then check:

```bash
curl -s https://scudra.persidian.com/api/verify            # the product's public key
curl -s https://analyst.149.248.9.254.sslip.io/api/verify  # the analyst's public key
curl -s https://scudra.persidian.com/api/cases             # {"cases":[],"persisted":true}
```

---

## Two things this box cannot do

1. **Blindspot cannot run an investigation without `MOBULA_API_KEY`.** The
   onchain data comes from Mobula, and there is no key configured. The API
   says so by name: _"This server is missing MOBULA_API_KEY — the operator
   needs to configure it before investigations can run."_ Everything else
   works — the store, the receipt, the export, the waitlist, the analytics.
2. **The off-chain half of Blindspot degrades.** A stealth browser session
   needs a paid Solari plan; on the free tier the investigation continues with
   the onchain data only and says what it could not collect. Fixing that
   properly means owning the browser primitive — see
   [`long-term-strategy.md`](long-term-strategy.md) §2.2.

**The box is also small.** 1 vCPU and 1 GB, with three Node processes and
Docker on it. The containment probe's fork-bomb case starves the host's
process spawning on a box this size (the probe still reports BLOCKED, but
the evidence becomes an OCI resource error rather than the memory limit it
was meant to demonstrate). Bumping the VM to 2 vCPU / 2 GB would make the
probe evidence honest and leave room for the product to grow.

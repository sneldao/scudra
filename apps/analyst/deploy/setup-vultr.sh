#!/usr/bin/env bash
# Provision a fresh Ubuntu 24.04 Vultr Cloud Compute VM for the Analyst.
# Usage (as root on the VM):  bash setup-vultr.sh
set -euo pipefail

apt-get update -y
apt-get install -y ca-certificates curl git ufw
curl -fsSL https://get.docker.com | sh
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
npm i -g pnpm@9.15.0

# Dedicated unprivileged user. It is in the docker group (== root-equivalent on
# the host), which is why the app must NEVER run user-supplied code itself —
# only inside the locked-down containers.
id scudra &>/dev/null || useradd -m -s /bin/bash scudra
usermod -aG docker scudra

# The sandbox image (python + pandas/numpy/matplotlib) is built from the repo
# after clone — see the final instructions below.

# Firewall: SSH + HTTP(S) only. Sandboxes have no network regardless.
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp
ufw --force enable

cat <<'MSG'
Done. As user 'scudra':
  git clone <repo> && cd scudra
  docker build -t scudra-sandbox:latest apps/analyst/sandbox
  cp apps/analyst/.env.example apps/analyst/.env   # fill in keys, set TRUST_PROXY=1
  pnpm install && pnpm build:analyst
  pnpm --filter @scudra/analyst cli --doctor        # every line must be a check
  pnpm --filter @scudra/analyst cli --probe         # 7/7 BLOCKED, on real Docker
Then run it under systemd (see apps/analyst/deploy/scudra-analyst.service) and put Caddy in front.
MSG

#!/usr/bin/env bash
# Creates the wallet the hosted keeper (Railway) signs with, authorizes it on
# the devnet long/short program and funds it. Run in a Codespace:
#
#   bash scripts/setup-keeper.sh
#
# It prints the wallet's secret key ONCE so you can paste it into Railway's
# KEEPER_KEYPAIR variable. Don't share it or paste it anywhere else.
set -euo pipefail
cd "$(dirname "$0")"
npm install --silent --no-audit --no-fund >/dev/null

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
KEY="$TMP/keeper.json"
ADDRESS="$(npx tsx src/devnet-wallet.ts "$KEY" 0 | awk '/^wallet/{print $2}')"

env -u GITHUB_TOKEN gh workflow run devnet-set-keeper.yml -f keeper="$ADDRESS" >/dev/null
echo "Keeper wallet: $ADDRESS"
echo "Authorizing and funding it on devnet (takes ~1 minute in GitHub Actions)."
echo
echo "Copy EVERYTHING on the next line into Railway as the KEEPER_KEYPAIR variable:"
echo
cat "$KEY"
echo
echo
echo "Then tell Claude 'keeper ready'."

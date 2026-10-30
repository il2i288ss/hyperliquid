#!/usr/bin/env bash
# One-time devnet setup. Run inside a GitHub Codespace for this repo:
#
#   bash scripts/setup-devnet.sh
#
# Creates a throwaway DEVNET wallet (fake SOL, no real value), saves it as the
# repo secret DEVNET_KEYPAIR so the "Devnet test" workflow can use it, then
# deletes the local copy. Never use this wallet on mainnet.
set -euo pipefail
cd "$(dirname "$0")"

echo "Installing script dependencies..."
npm install --silent --no-audit --no-fund >/dev/null

TMP="$(mktemp -d)"
KEY="$TMP/devnet.json"
trap 'rm -rf "$TMP"' EXIT
ADDRESS="$(npx tsx src/devnet-wallet.ts "$KEY" 0 | awk '/^wallet/{print $2}')"
[ -n "$ADDRESS" ] || { echo "Could not create wallet"; exit 1; }

# Codespaces' built-in token cannot write secrets, so use your own GitHub login.
if ! env -u GITHUB_TOKEN gh auth status >/dev/null 2>&1; then
  echo
  echo "GitHub will show a one-time code. Open the link, paste the code, approve."
  env -u GITHUB_TOKEN gh auth login -h github.com -w -s repo
fi
env -u GITHUB_TOKEN gh secret set DEVNET_KEYPAIR < "$KEY"

echo
echo "Done. Devnet wallet saved as the DEVNET_KEYPAIR secret."
echo
echo "Last step: get free devnet SOL for this address:"
echo "  $ADDRESS"
echo "Open https://faucet.solana.com, paste the address, choose devnet, request 5 SOL"
echo "(do it twice if it lets you). Then tell Claude 'funded'."

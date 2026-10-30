#!/usr/bin/env bash
# One-time MAINNET setup. Run in a Codespace:
#
#   git pull && bash scripts/setup-mainnet.sh
#
# 1. Creates the platform's bot wallets (fee bot, payout bot, vault reserve)
# 2. Waits for you to send the fee bot ~0.1 SOL (pays for the Meteora configs)
# 3. Creates your two Meteora configs on mainnet (platform + main coin)
# 4. Prints exactly what to paste into Railway and Vercel
#
# The private keys are printed ONCE. Save that block in a password manager:
# the fee bot key is the ONLY key that can claim your platform's fees.
set -euo pipefail
cd "$(dirname "$0")"
TREASURY="GCHZXtrG8dF8n7KNgcxWGR4QpCBhf71ZBgrQDeKroUi6"

echo "Installing…"
npm install --silent --no-audit --no-fund >/dev/null

echo
read -r -p "Paste your Helius MAINNET RPC URL, then Enter: " RPC
# Strip invisible characters some terminals add when pasting (e.g. ESC[201~).
RPC="$(printf '%s' "$RPC" | sed -e 's/\x1b\[[0-9;]*~//g' | tr -cd '[:graph:]')"
clear
case "$RPC" in
  *devnet*) echo "That's a devnet URL. In Helius, switch to Mainnet and copy that one."; exit 1 ;;
  https://*) ;;
  *) echo "That doesn't look like an RPC URL."; exit 1 ;;
esac
export RPC_URL="$RPC"
echo "Checking the RPC URL…"
if ! npx tsx src/check-rpc.ts; then
  echo "Helius rejected that URL. Copy the Mainnet RPC URL again and re-run this script."
  exit 1
fi

DIR="$HOME/.mainnet-setup"; mkdir -p "$DIR"; chmod 700 "$DIR"
for w in fee-bot payout-bot vault-reserve; do
  # Re-running the script reuses the same wallets.
  [ -f "$DIR/$w.json" ] || npx tsx src/new-wallet.ts "$DIR/$w.json" > "$DIR/$w.addr"
done
addr() { cat "$DIR/$1.addr"; }
FEE_BOT="$(addr fee-bot)"; PAYOUT="$(addr payout-bot)"; RESERVE="$(addr vault-reserve)"

if [ -f "$DIR/deployments.json" ]; then
  # Already set up: just print the settings again.
  cp "$DIR/deployments.json" deployments.json
  SKIP_FUNDING=1
fi

if [ -z "${SKIP_FUNDING:-}" ]; then
echo
echo "Fee bot wallet: $FEE_BOT"
echo "Send it 0.1 SOL from your Phantom (MAINNET). It pays for creating the configs"
echo "(about 0.01 SOL) and the bot's transaction fees afterwards."
echo "Also send 0.05 SOL to the payout bot: $PAYOUT"
echo
npx tsx src/wait-balance.ts "$FEE_BOT" 0.05
fi

if [ -f deployments.json ] && grep -q mainnet deployments.json 2>/dev/null; then
  echo "Configs already created."
else
  export ADMIN_KEYPAIR="$(cat "$DIR/fee-bot.json")" FEE_SPLITTER_WALLET="$FEE_BOT"
  rm -f deployments.json
  npx tsx src/create-partner-config.ts
  npx tsx src/create-partner-config.ts --main
  node -e 'const f="deployments.json";const d=require("./"+f);d.network="mainnet";require("fs").writeFileSync(f,JSON.stringify(d,null,2))'
fi
PLATFORM="$(node -p 'require("./deployments.json").platformConfig')"
MAIN="$(node -p 'require("./deployments.json").mainCoinConfig')"
cp deployments.json "$DIR/deployments.json"

cat <<EOF

================================================================================
 MAINNET IS SET UP.  Save everything between the lines in a password manager.
================================================================================

--- RAILWAY (new service for mainnet) → Variables → Raw Editor -----------------
RPC_URL=$RPC
KEEPER_KEYPAIR=$(cat "$DIR/fee-bot.json")
FEE_SPLITTER_KEYPAIR=$(cat "$DIR/fee-bot.json")
FEE_SPLITTER_WALLET=$FEE_BOT
HOLDER_POT_KEYPAIR=$(cat "$DIR/payout-bot.json")
HOLDER_POT_WALLET=$PAYOUT
LEVERAGE_VAULT_PDA=$RESERVE
PLATFORM_CONFIG=$PLATFORM
MAIN_COIN_CONFIG=$MAIN
TREASURY_WALLET=$TREASURY
REWARDS=on
DATA_DIR=/data
REWARD_EXCLUDED=$TREASURY,$FEE_BOT,$PAYOUT,$RESERVE

--- VERCEL (mainnet project) → Environment Variables ----------------------------
NEXT_PUBLIC_NETWORK=mainnet-beta
NEXT_PUBLIC_RPC_URL=$RPC
NEXT_PUBLIC_DBC_CONFIG=$PLATFORM
PINATA_JWT=<your Pinata JWT>

--- KEEP SAFE (not needed anywhere now) -----------------------------------------
Vault reserve key (holds the 1.9% until long/short launches):
$(cat "$DIR/vault-reserve.json")
Main coin config (launch your main coin with this): $MAIN
================================================================================

Then tell Claude: "mainnet setup done". Do NOT paste the block into chat.
EOF

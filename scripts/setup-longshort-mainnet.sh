#!/usr/bin/env bash
# Turns long/short ON for mainnet. Run in the same Codespace as setup-mainnet.sh:
#
#   git pull && bash scripts/setup-longshort-mainnet.sh
#
# 1. Downloads the mainnet build of the long/short program (built + tested by
#    the "Mainnet program build" GitHub workflow)
# 2. Waits for the fee bot to hold enough SOL for the program's rent
# 3. Deploys it with the fee bot wallet and starts it (settings + vault)
# 4. Prints the Railway and Vercel settings to add
set -euo pipefail
cd "$(dirname "$0")"
DIR="$HOME/.mainnet-setup"
[ -f "$DIR/fee-bot.json" ] || { echo "Can't find $DIR/fee-bot.json. Run this in the Codespace where you ran setup-mainnet.sh."; exit 1; }
FEE_BOT="$(cat "$DIR/fee-bot.addr")"

echo "Installing…"
npm install --silent --no-audit --no-fund >/dev/null
if ! command -v solana >/dev/null; then
  sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)" >/dev/null 2>&1
fi
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

read -r -p "Paste your Helius MAINNET RPC URL, then Enter: " RPC
RPC="$(printf '%s' "$RPC" | sed -e 's/\x1b\[[0-9;]*~//g' | tr -cd '[:graph:]')"
clear
export RPC_URL="$RPC"
npx tsx src/check-rpc.ts || { echo "Copy the Helius Mainnet RPC URL again and re-run."; exit 1; }

echo "Downloading the mainnet long/short program…"
P="$DIR/program"; rm -rf "$P"; mkdir -p "$P"
git fetch -q origin mainnet-program
for f in leverage.so program-keypair.json program-id.txt leverage.so.sha256; do git show "FETCH_HEAD:$f" > "$P/$f"; done
(cd "$P" && sed "s#/tmp/pub/##" leverage.so.sha256 | sha256sum -c --quiet) || { echo "Download is corrupted. Re-run."; exit 1; }
PROGRAM_ID="$(cat "$P/program-id.txt")"
SIZE=$(stat -c %s "$P/leverage.so")
MAXLEN=$SIZE   # no spare room: cheapest rent (a bigger upgrade later runs `solana program extend` first)

if solana program show "$PROGRAM_ID" -u "$RPC" >/dev/null 2>&1; then
  echo "Program already deployed: $PROGRAM_ID"
else
  # Upload buffer (refunded right after deploy) + the program's own rent.
  BUF=$(solana rent $((SIZE + 37)) -u "$RPC" | awk '/Rent-exempt minimum/ {print $3}')
  PRG=$(solana rent $((MAXLEN + 45)) -u "$RPC" | awk '/Rent-exempt minimum/ {print $3}')
  NEED=$(awk "BEGIN {printf \"%.2f\", $BUF + $PRG + 0.15}")
  echo
  echo "Deploying needs $NEED SOL in the fee bot: $FEE_BOT"
  echo "About $BUF SOL comes straight back to the fee bot when the upload finishes."
  echo "The other ~$PRG SOL is rent locked in the program (recoverable by closing it later)."
  npx tsx src/wait-balance.ts "$FEE_BOT" "$NEED"
  echo "Deploying (takes 1–3 minutes)…"
  solana program deploy "$P/leverage.so" --program-id "$P/program-keypair.json" --max-len "$MAXLEN" \
    -u "$RPC" -k "$DIR/fee-bot.json" --with-compute-unit-price 50000 --max-sign-attempts 60 --use-rpc
fi

OUT="$(ADMIN_KEYPAIR="$DIR/fee-bot.json" LEVERAGE_PROGRAM_ID="$PROGRAM_ID" npx tsx src/mainnet-longshort-init.ts)"
echo "$OUT"
VAULT="$(printf '%s\n' "$OUT" | sed -n 's/^VAULT=//p')"
echo "$PROGRAM_ID $VAULT" > "$DIR/longshort.txt"

cat <<EOF

================================================================================
 LONG/SHORT IS DEPLOYED ON MAINNET
================================================================================
Program: $PROGRAM_ID
Vault:   $VAULT   (anyone can check it on Solscan; nobody can withdraw from it)

--- RAILWAY (mainnet service) → Variables: ADD one, CHANGE one ------------------
LEVERAGE_PROGRAM_ID=$PROGRAM_ID
LEVERAGE_VAULT_PDA=$VAULT

--- VERCEL (mainnet project) → Environment Variables: ADD -----------------------
NEXT_PUBLIC_LEVERAGE=on
NEXT_PUBLIC_LEVERAGE_PROGRAM=$PROGRAM_ID
(then Deployments → ⋯ → Redeploy)

--- FILL THE VAULT --------------------------------------------------------------
The 1.9% of every trade now flows into the vault automatically. Each coin can
use at most 5% of the vault, so a bigger vault = bigger positions. To start
with room, send SOL from Phantom straight to the vault address above.
================================================================================
EOF

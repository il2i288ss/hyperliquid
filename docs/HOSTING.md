# Hosting (devnet)

Everything runs in the cloud. Nothing runs on your computer.

| Part | Where | Folder |
|---|---|---|
| Website | Vercel | `app` |
| Keeper (prices, long/short registration, liquidations, payouts) | Railway | `scripts` |
| Images for new coins | Pinata | — |
| Solana connection | Helius (devnet RPC) | — |

## 1. Helius (RPC)
1. Sign up at helius.dev with GitHub.
2. Copy the **devnet** RPC URL (looks like `https://devnet.helius-rpc.com/?api-key=...`).

## 2. Pinata (coin images)
1. Sign up at pinata.cloud.
2. API Keys → New Key → Admin → copy the **JWT**.

## 3. Vercel (website)
1. vercel.com → sign up with GitHub → **Add New → Project** → import `hyperliquid`.
2. **Root Directory**: `app`.
3. Environment variables:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_RPC_URL` | Helius devnet URL |
| `NEXT_PUBLIC_NETWORK` | `devnet` |
| `PINATA_JWT` | Pinata JWT |

4. Deploy.

## 4. Railway (keeper)
1. In a Codespace run `bash scripts/setup-keeper.sh`; it prints the keeper wallet's secret.
2. railway.com → **New Project → Deploy from GitHub repo** → `hyperliquid`.
3. Service **Settings → Root Directory**: `scripts` (start command comes from `scripts/railway.json`).
4. **Variables**:

| Name | Value |
|---|---|
| `RPC_URL` | Helius devnet URL |
| `KEEPER_KEYPAIR` | the line printed by `setup-keeper.sh` |
| `LEVERAGE_PROGRAM_ID` | `CVa7fiyDKgrE1EHxcgLPNJv69Yj5hLSfnfu1XhhhuR2x` |
| `PLATFORM_CONFIG` | `2vXECqjW5vLPD4cvunQujy3jU5YfxrTEBmfJUNjFjYY9` |
| `MARKET_MIN_POOL_SOL` | `0.25` |
| `ALERT_WEBHOOK_URL` | optional: a Discord channel webhook for error alerts |

Holder payouts (`REWARDS=on`) stay off on devnet: they need the fee wallets set up for mainnet.

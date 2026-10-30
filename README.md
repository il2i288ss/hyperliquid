# Launchpad

A Solana memecoin launchpad on Meteora DBC where:

- anyone launches a coin from their own wallet for **0.03 SOL**
- buys in the **launch slot pay 90%** (anti-sniper); the creator's first buy is exempt
- every trade pays **3%**: **1% to holders in SOL**, **0.1% treasury**, **1.9% long/short vault**
- traders can **long or short** coins with SOL; wins are paid from the vault and never move the chart

```
launchpad/
├── scripts/                 Node/TS: Meteora config, fee claiming, splitting, holder rewards
│   ├── src/platform.ts      ← all fee numbers live here
│   ├── src/create-partner-config.ts
│   ├── src/claim-fees.ts
│   ├── src/split-fees.ts
│   └── src/rewards/         snapshot.ts, airdrop.ts, allocate.ts (pure, tested)
├── app/                     Next.js website: wallet connect, launch form, buy/sell
└── programs/leverage/       Anchor program: long/short vault
    └── src/math.rs          ← tiers, caps, PnL, TWAP, price impact (pure, tested)
```

## Status

[![CI](https://github.com/il2i288ss/hyperliquid/actions/workflows/ci.yml/badge.svg)](https://github.com/il2i288ss/hyperliquid/actions/workflows/ci.yml)

Every push is built and tested on GitHub (scripts tests + typecheck,
website production build, program compile + tests).

| Part | State |
|---|---|
| Fee split, holder rewards, leverage math | Unit-tested in CI |
| Meteora config / claim / launch / swap | **Passing on devnet** (Actions → "Devnet test"): 90% launch-slot fee, 3.75% after, buy, sell, fee claim, 0.027 SOL launch fee claim |
| Holder SOL rewards | **Passing on devnet**: 3 real holders, snapshots, time-weighted split, payouts land exactly, team + program wallets excluded |
| Website: launch + buy/sell | Production build passes in CI; not yet run on devnet |
| Long/short program | Builds for Solana in CI (315 KB); reads Meteora DBC pools; not yet deployed (needs ~4.5 devnet SOL during deploy) |
| Graduated-coin (DAMM v2) price reads | Not configured yet (phase 2) |
| Postgres, on-chain fee splitter, indexer, full UI, keepers | Next |

Meteora facts confirmed from the SDK: 20% of trading fees and 10% of each
launch fee go to Meteora (so a 0.03 SOL launch nets 0.027 SOL), max fee is 99%,
and `poolCreationFee` is set in SOL.

## Setup (devnet first)

```bash
# 1. Scripts
cd scripts && npm install && npm test
cp .env.example .env            # fill in RPC + keypairs + wallets
npm run config                  # creates the platform DBC config
npm run config:main             # creates your main coin's config (fees -> team)

# 2. Website
cd ../app && npm install
cp .env.example .env.local      # NEXT_PUBLIC_DBC_CONFIG from scripts/deployments.json
npm run dev                     # http://localhost:3000

# 3. Long/short program
cd .. && anchor keys sync && anchor build && anchor deploy --provider.cluster devnet
rustc --edition 2021 --test programs/leverage/src/math.rs -o /tmp/mt && /tmp/mt   # math tests
```

## Keeper jobs (cron)

```cron
*/15 * * * *   cd scripts && npm run claim && npm run split && npm run airdrop   # pay holders every 15 min
*/3 * * * *    sleep $((RANDOM % 150)); cd scripts && npm run snapshot          # ~5 random snapshots per payout
```

Graduated coins earn fees on their DAMM v2 LP position; add a claim using the
DAMM v2 SDK (`@meteora-ag/cp-amm-sdk`, `claimPositionFee`) once coins graduate.

## Long/short rules (programs/leverage/src/math.rs)

| Market cap (3-min TWAP) | Leverage | Max margin | Max position | Fee each way |
|---|---|---|---|---|
| Under $100K (pool ≥ 20 SOL, coin ≥ 30 min old) | 2x | 0.5 SOL | 1 SOL | 0.5% |
| $100K–$500K | 3x | 4 SOL | 12 SOL | 0.5% |
| $500K–$1M | 5x | 5 SOL | 25 SOL | 0.5% |
| $1M–$5M | 10x | 5 SOL | 50 SOL | 0.3% |
| $5M–$10M | 10x | 8 SOL | 80 SOL | 0.3% |
| $10M+ | 10x | 10 SOL | 100 SOL | 0.3% |

Always on: virtual price impact, TWAP prices, minimum hold time, profit cap
(5x margin, 3x on degen tier), liquidation at 90% loss, per-coin cap per side
= smaller of **5% of pool SOL (4% on 10x tiers)** and **5% of the vault**, degen
tier total ≤ 2% of the vault. The vault has **no withdraw instruction**.

### What the tests found

- **Per-coin caps were lowered from 10% to 5% of pool SOL (4% on 10x).** At 10%,
  pumping a coin 30% and closing a full-cap long was profitable even with
  virtual price impact. At 5%/4% it loses money (`pump_attack_is_unprofitable`).
- **Bigger pumps are still a risk.** A sustained 60%+ pump held through the TWAP
  window can still profit at these caps. The defences are the hold time, TWAP,
  profit caps and per-coin vault limit; consider delayed close pricing
  (close at the TWAP of the next 60 s) before mainnet.
- **Virtual impact costs honest traders too.** A max-size position on a coin
  that genuinely rises 40% keeps roughly two thirds of the raw gain.

## Before mainnet

1. Fill the Meteora pool byte offsets in `lib.rs` (`DBC_SQRT_PRICE_OFFSET`, …) from the IDLs.
2. Resolve every `VERIFY`, run everything on devnet, attack it with bots.
3. Insider-dump protection: keeper disables leverage (`set_market`) when the top 10 holders own > 30–40%.
4. Put program upgrade authority and `admin` on a Squads multisig.
5. Audit the leverage program.
6. Legal advice on leverage + holder revenue share in your jurisdiction.

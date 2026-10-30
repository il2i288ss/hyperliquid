/**
 * The 24/7 keeper. One process, several jobs on timers:
 *
 *   prices     every  8 s  record each long/short coin's pool price on-chain
 *   markets    every 60 s  register coins that reached enough liquidity for
 *                          long/short; switch leverage off when a coin graduates
 *   liquidate  every 10 s  close positions that lost 90% of their margin
 *   solprice   every  5 m  keep the on-chain SOL/USD (used for tiers) current
 *   snapshot   every  3 m  holder balances (random offset)       [REWARDS=on]
 *   payout     every 15 m  claim fees -> split -> pay holders     [REWARDS=on]
 *
 *   npm run keeper
 *
 * Env: RPC_URL, KEEPER_KEYPAIR, LEVERAGE_PROGRAM_ID, PLATFORM_CONFIG,
 *      REWARDS=on (+ the fee/reward wallet vars), ALERT_WEBHOOK_URL (optional:
 *      Discord/Slack-style webhook that receives errors).
 */
import { ComputeBudgetProgram, PublicKey, Transaction, sendAndConfirmTransaction, type TransactionInstruction } from "@solana/web3.js";
import bs58 from "bs58";
import { connection, dbc, loadKeypair } from "../env.js";
import { LeverageClient, decodeMarket, decodePosition, programError } from "../leverage/client.js";
import { claimFees } from "../claim-fees.js";
import { splitFees } from "../split-fees.js";
import { snapshotAll } from "../rewards/snapshot.js";
import { payHolders } from "../rewards/airdrop.js";
import { solUsdNow } from "../sol-price.js";

const keeper = loadKeypair("KEEPER_KEYPAIR");
// Long/short jobs run only when a program id is set (off on mainnet until audited).
const LEVERAGE = Boolean(process.env.LEVERAGE_PROGRAM_ID);
const lev = new LeverageClient(new PublicKey(process.env.LEVERAGE_PROGRAM_ID || "11111111111111111111111111111111"));
const config = new PublicKey(process.env.PLATFORM_CONFIG!);
if (!process.env.RPC_URL) throw new Error("Set RPC_URL");
const REWARDS = process.env.REWARDS === "on";
const DISC = {
  Market: Buffer.from([219, 190, 213, 55, 0, 227, 198, 154]),
  Position: Buffer.from([170, 188, 143, 228, 122, 64, 247, 208]),
  Global: Buffer.from([167, 232, 232, 177, 200, 108, 114, 127]),
};

const log = (job: string, msg: string) => console.log(`${new Date().toISOString()} [${job}] ${msg}`);

const lastAlert = new Map<string, number>();
async function alert(job: string, err: unknown) {
  const text = `[keeper/${job}] ${programError(err) ?? (err as Error)?.message ?? String(err)}`.slice(0, 1800);
  console.error(text);
  // Same error from the same job: alert at most every 10 minutes.
  const key = `${job}:${text.slice(0, 120)}`;
  if (Date.now() - (lastAlert.get(key) ?? 0) < 10 * 60_000) return;
  lastAlert.set(key, Date.now());
  const url = process.env.ALERT_WEBHOOK_URL;
  if (url) await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: text, text }) }).catch(() => {});
}

async function send(ixs: TransactionInstruction[]) {
  const tx = new Transaction().add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5_000 }), ...ixs);
  return sendAndConfirmTransaction(connection, tx, [keeper], { commitment: "confirmed" });
}

/** Run `fn` every `ms` (plus up to `jitter` ms), never overlapping itself. */
function every(job: string, ms: number, fn: () => Promise<void>, jitter = 0) {
  let running = false;
  const tick = async () => {
    if (!running) {
      running = true;
      try {
        await fn();
      } catch (e) {
        await alert(job, e);
      } finally {
        running = false;
      }
    }
    setTimeout(tick, ms + Math.random() * jitter);
  };
  setTimeout(tick, Math.random() * 2_000);
}

async function markets() {
  const accounts = await connection.getProgramAccounts(lev.programId, {
    filters: [{ memcmp: { offset: 0, bytes: bs58.encode(DISC.Market) } }],
  });
  return accounts.map((a) => ({ address: a.pubkey, ...decodeMarket(a.account.data as Buffer) }));
}

async function testBuild() {
  const info = await connection.getAccountInfo(lev.global);
  // Global: disc 8, admin 32, keeper 32, sol_usd 8, paused 1, test_build 1
  return info ? info.data[8 + 32 + 32 + 8 + 1] === 1 : false;
}

// ---------- jobs ----------

async function pricesJob() {
  const live = (await markets()).filter((m) => m.enabled);
  for (let i = 0; i < live.length; i += 8) {
    const batch = live.slice(i, i + 8);
    // The program itself ignores updates closer than 8 s apart.
    await send(batch.map((m) => lev.updatePrice(m.mint, m.pool)));
  }
}

async function marketsJob() {
  // Register before the 20 SOL unlock so price history builds up.
  const minPoolSol = process.env.MARKET_MIN_POOL_SOL ? Number(process.env.MARKET_MIN_POOL_SOL) : (await testBuild()) ? 0.25 : 10;
  const existing = new Map((await markets()).map((m) => [m.mint.toBase58(), m]));
  const [pools, slot] = await Promise.all([dbc.state.getPoolsByConfig(config), connection.getSlot()]);

  let registered = 0;
  for (const { publicKey: pool, account } of pools) {
    const s = account.poolState;
    const mint = s.baseMint as PublicKey;
    const market = existing.get(mint.toBase58());
    const poolSol = Number(s.quoteReserve.toString()) / 1e9;

    if (market && s.isMigrated && market.enabled) {
      // Graduated: prices now live in the DAMM v2 pool, which the program
      // can't read yet. Switch leverage off rather than use a stale price.
      await send([lev.setMarket(keeper.publicKey, mint, market.pool, false, market.poolKind)]);
      log("markets", `disabled ${mint.toBase58()} (graduated)`);
    } else if (!market && !s.isMigrated && poolSol >= minPoolSol) {
      const launchedAt = BigInt(Math.floor(Date.now() / 1000 - (slot - Number(s.activationPoint.toString())) * 0.4));
      await send([lev.createMarket(keeper.publicKey, mint, pool, 0, launchedAt)]);
      log("markets", `registered ${mint.toBase58()} (${poolSol.toFixed(2)} SOL in pool)`);
      registered++;
    }
  }
  log("markets", `${pools.length} coins, ${existing.size + registered} with long/short (min pool ${minPoolSol} SOL)`);
}

async function liquidateJob() {
  const [positions, mkts] = await Promise.all([
    connection.getProgramAccounts(lev.programId, { filters: [{ memcmp: { offset: 0, bytes: bs58.encode(DISC.Position) } }] }),
    markets(),
  ]);
  const byAddress = new Map(mkts.map((m) => [m.address.toBase58(), m]));
  for (const { account } of positions) {
    const p = decodePosition(account.data as Buffer);
    const m = byAddress.get(p.market.toBase58());
    if (!m) continue;
    const latest = [...m.obs].sort((a, b) => Number(b.ts - a.ts))[0];
    if (!latest || latest.price === 0n) continue;
    const ratio = Number(latest.price) / Number(p.entryPrice);
    const pnl = p.long ? Number(p.notional) * (ratio - 1) : Number(p.notional) * (1 - ratio);
    // Try once the spot loss is near 90%; the program does the exact check.
    if (pnl <= -0.85 * Number(p.margin)) {
      await send([lev.liquidate(keeper.publicKey, p.owner, m.mint, p.nonce)])
        .then((sig) => log("liquidate", `liquidated ${p.owner.toBase58()} on ${m.mint.toBase58()}: ${sig}`))
        .catch((e) => {
          if (programError(e) !== "NotLiquidatable") throw e;
        });
    }
  }
}

async function solPriceJob() {
  const info = await connection.getAccountInfo(lev.global);
  if (!info) return;
  const d = info.data;
  const admin = new PublicKey(d.subarray(8, 40));
  if (d[81] === 1 || !admin.equals(keeper.publicKey)) return; // devnet test build, or not our program
  const current = Number(d.readBigUInt64LE(72)) / 1e6;
  const now = await solUsdNow();
  if (Math.abs(now - current) / current < 0.01) return;
  await send([lev.setParams(keeper.publicKey, BigInt(Math.round(now * 1e6)), d[80] === 1, new PublicKey(d.subarray(40, 72)))]);
  log("solprice", `SOL/USD $${current.toFixed(2)} -> $${now.toFixed(2)}`);
}

async function payoutJob() {
  // Main coin: every fee straight to the treasury.
  if (process.env.MAIN_COIN_CONFIG) await claimFees(true).catch((e) => alert("payout/main", e));
  await claimFees(false);
  await splitFees();
  await payHolders(false);
}

log("keeper", `starting as ${keeper.publicKey.toBase58()} · long/short ${LEVERAGE ? "on" : "off"} · rewards ${REWARDS ? "on" : "off"}`);
if (LEVERAGE) {
  every("prices", 8_000, pricesJob);
  every("markets", 60_000, marketsJob);
  every("liquidate", 10_000, liquidateJob);
  every("solprice", 5 * 60_000, solPriceJob);
}
if (REWARDS) {
  every("snapshot", 150_000, snapshotAll, 60_000);
  every("payout", 15 * 60_000, payoutJob);
}

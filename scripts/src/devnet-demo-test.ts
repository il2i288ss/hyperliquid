/**
 * End-to-end test on the stable devnet platform, the way testers will use it:
 *
 *   1. set the devnet SOL price (SOL_USD) so "$100K" is reachable
 *   2. buy the demo coin until its market cap passes $100K
 *   3. the 3x tier unlocks: 5x rejected, 3x long and 3x short open
 *   4. after the hold time both close and pay out from the vault
 *
 *   SOL_USD=2000 DEMO_MINT=... DEMO_POOL=... LEVERAGE_PROGRAM_ID=... npx tsx src/devnet-demo-test.ts
 */
import { LAMPORTS_PER_SOL, PublicKey, Transaction, sendAndConfirmTransaction, type TransactionInstruction } from "@solana/web3.js";
import BN from "bn.js";
import fs from "node:fs";
import { connection, dbc, loadKeypair } from "./env.js";
import { LeverageClient, decodeMarket, decodePosition, programError } from "./leverage/client.js";

const admin = loadKeypair("ADMIN_KEYPAIR");
const lev = new LeverageClient(new PublicKey(process.env.LEVERAGE_PROGRAM_ID!));
const mint = new PublicKey(process.env.DEMO_MINT!);
const pool = new PublicKey(process.env.DEMO_POOL!);
const solUsd = Number(process.env.SOL_USD ?? "2000");
const TARGET_USD = 105_000;
const SOL = BigInt(LAMPORTS_PER_SOL);

const checks: { name: string; ok: boolean; detail: string }[] = [];
const result: Record<string, unknown> = { checks };
const check = (name: string, ok: boolean, detail: string) => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: ${detail}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const send = (x: TransactionInstruction[] | Transaction) =>
  sendAndConfirmTransaction(connection, x instanceof Transaction ? x : new Transaction().add(...x), [admin], { commitment: "confirmed" });

async function mcapUsd() {
  const s = (await dbc.state.getPool(pool))!.poolState;
  const sqrt = Number(s.sqrtPrice.toString()) / 2 ** 64;
  return ((sqrt * sqrt) / 1e3) * 1_000_000_000 * solUsd;
}

async function updatePrices(seconds: number) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    await send([lev.updatePrice(mint, pool)]).catch(() => {});
    await sleep(9_000);
  }
}

async function main() {
  // 1. Devnet price knob, keeping the live keeper
  const g = (await connection.getAccountInfo(lev.global))!;
  const keeper = new PublicKey(g.data.subarray(40, 72));
  await send([lev.setParams(admin.publicKey, BigInt(solUsd * 1e6), false, keeper)]);
  check("devnet SOL price set", true, `$${solUsd} (keeper ${keeper.toBase58()} kept)`);

  // 2. Pump past $100K
  let mcap = await mcapUsd();
  result.startMcapUsd = Math.round(mcap);
  let spent = 0;
  while (mcap < TARGET_USD && spent < 3) {
    await send(
      await dbc.pool.swap({ owner: admin.publicKey, pool, amountIn: new BN(0.25 * LAMPORTS_PER_SOL), minimumAmountOut: new BN(1), swapBaseForQuote: false, referralTokenAccount: null }),
    );
    spent += 0.25;
    mcap = await mcapUsd();
  }
  result.endMcapUsd = Math.round(mcap);
  check("coin pumped past $100K", mcap >= TARGET_USD, `$${Math.round(result.startMcapUsd as number).toLocaleString()} → $${Math.round(mcap).toLocaleString()} with ${spent} SOL`);

  // Build fresh price history so the averaged market cap catches up
  await updatePrices(30);
  const market = decodeMarket((await connection.getAccountInfo(lev.market(mint)))!.data);
  const margin = SOL / 100n; // 0.01 SOL
  const base = BigInt(Date.now());

  // 3. Tier rules at $100K+
  try {
    await send([lev.openPosition(admin.publicKey, mint, base, true, margin, 5)]);
    check("5x rejected at the 3x tier", false, "opened");
  } catch (e) {
    check("5x rejected at the 3x tier", programError(e) === "TooMuchLeverage", programError(e) ?? String(e));
  }
  await send([lev.openPosition(admin.publicKey, mint, base + 1n, true, margin, 3)]);
  const pl = decodePosition((await connection.getAccountInfo(lev.position(lev.market(mint), admin.publicKey, base + 1n)))!.data);
  check("open 3x long in the $100K tier", pl.tier === 1, `tier ${pl.tier}, size ${Number(pl.notional) / LAMPORTS_PER_SOL} SOL`);
  await send([lev.openPosition(admin.publicKey, mint, base + 2n, false, margin, 3)]);
  check("open 3x short", true, `pool ${Number(market.poolSol) / LAMPORTS_PER_SOL} SOL`);

  // 4. Close both after the hold time
  await updatePrices(12);
  for (const [name, nonce] of [["long", base + 1n], ["short", base + 2n]] as const) {
    const before = await connection.getBalance(admin.publicKey);
    await send([lev.closePosition(admin.publicKey, mint, nonce)]);
    const got = ((await connection.getBalance(admin.publicKey)) - before) / LAMPORTS_PER_SOL;
    check(`close ${name}: paid from vault`, got > 0, `+${got.toFixed(6)} SOL (margin back ± PnL, minus fees and impact, plus position rent)`);
  }
}

main()
  .catch((e) => check("run", false, programError(e) ?? (e as Error).stack ?? String(e)))
  .finally(() => {
    fs.writeFileSync("demo-result.json", JSON.stringify(result, null, 2));
    const failed = checks.filter((c) => !c.ok).length;
    console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
    process.exit(failed ? 1 : 0);
  });

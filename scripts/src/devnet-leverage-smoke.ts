/**
 * Devnet test of the long/short program against a real Meteora coin.
 *
 *   LEVERAGE_PROGRAM_ID=... ADMIN_KEYPAIR=./devnet.json RPC_URL=... npm run smoke:leverage
 *
 * Checks: init, vault funding, market creation, price history, tier limits,
 * per-coin cap, hold time, pause, open/close long, "not liquidatable" guard,
 * and liquidating a short after a real pump. Writes leverage-result.json.
 */
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  type TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { NATIVE_MINT, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { deriveDbcPoolAddress } from "@meteora-ag/dynamic-bonding-curve-sdk";
import BN from "bn.js";
import fs from "node:fs";
import { connection, dbc, loadKeypair } from "./env.js";
import { curveConfig } from "./create-partner-config.js";
import { LeverageClient, decodeMarket, decodePosition, decodeVault, programError } from "./leverage/client.js";

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];
const result: Record<string, unknown> = { checks };
const check = (name: string, ok: boolean, detail: string) => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: ${detail}`);
};

const admin = loadKeypair("ADMIN_KEYPAIR");
const programId = new PublicKey(process.env.LEVERAGE_PROGRAM_ID!);
const lev = new LeverageClient(programId);
const SOL = BigInt(LAMPORTS_PER_SOL);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const send = (ixs: TransactionInstruction[] | Transaction, signers: Keypair[] = [admin]) =>
  sendAndConfirmTransaction(connection, ixs instanceof Transaction ? ixs : new Transaction().add(...ixs), signers, {
    commitment: "confirmed",
  });
/** Expect a transaction to fail with a specific program error. */
async function expectError(name: string, ixs: TransactionInstruction[], error: string) {
  try {
    await send(ixs);
    check(name, false, `succeeded, expected ${error}`);
  } catch (e) {
    const got = programError(e);
    check(name, got === error, `rejected with ${got ?? (e as Error).message.split("\n")[0]}`);
  }
}
const lamports = async (k: PublicKey) => BigInt(await connection.getBalance(k));

async function main() {
  console.log(`program ${programId.toBase58()}  wallet ${admin.publicKey.toBase58()}`);
  const startBal = await lamports(admin.publicKey);
  result.walletSol = Number(startBal) / LAMPORTS_PER_SOL;
  if (startBal < (12n * SOL) / 10n) throw new Error(`Need ~1.2 devnet SOL for this test, wallet has ${result.walletSol}`);
  result.program = programId.toBase58();

  // 1. Initialize (or reset params). The test coin uses a shallow curve
  // (~4 SOL mcap after the first buy); $50,000/SOL puts it in the
  // $100K-$500K tier (3x). Test-only numbers.
  const solUsd = 50_000n * 1_000_000n;
  const globalInfo = await connection.getAccountInfo(lev.global);
  await send([globalInfo ? lev.setParams(admin.publicKey, solUsd, false, admin.publicKey) : lev.initialize(admin.publicKey, solUsd)]);
  check("initialize / set params", true, globalInfo ? "params reset" : "initialized");

  // 2. Fund the vault to 0.5 SOL of free capital
  const vaultState = decodeVault((await connection.getAccountInfo(lev.vault))!.data);
  const vaultBal = await lamports(lev.vault);
  const free = vaultBal - vaultState.lockedMargin;
  if (free < SOL / 2n) {
    await send([SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: lev.vault, lamports: SOL / 2n - free })]);
  }
  check("vault funded (anyone can deposit)", true, `${Number(await lamports(lev.vault)) / LAMPORTS_PER_SOL} SOL in vault`);

  // 3. Launch a coin with 0.5 SOL of liquidity
  const config = Keypair.generate();
  await send(
    await dbc.partner.createConfig({
      config: config.publicKey,
      feeClaimer: admin.publicKey,
      leftoverReceiver: admin.publicKey,
      payer: admin.publicKey,
      quoteMint: NATIVE_MINT,
      ...curveConfig(false, { initialMcapSol: 3, migrationMcapSol: 60 }),
    }),
    [admin, config],
  );
  const mint = Keypair.generate();
  await send(
    await dbc.creator.createPoolWithFirstBuy({
      createPoolParam: {
        baseMint: mint.publicKey,
        config: config.publicKey,
        name: "Leverage Test",
        symbol: "LEV",
        uri: "https://example.com/lev.json",
        payer: admin.publicKey,
        poolCreator: admin.publicKey,
      },
      firstBuyParam: {
        buyer: admin.publicKey,
        buyAmount: new BN(0.3 * LAMPORTS_PER_SOL),
        minimumAmountOut: new BN(1),
        referralTokenAccount: null,
      },
    }),
    [admin, mint],
  );
  const pool = deriveDbcPoolAddress(NATIVE_MINT, mint.publicKey, config.publicKey);
  result.mint = mint.publicKey.toBase58();

  // 4. Market + price history
  await send([lev.createMarket(admin.publicKey, mint.publicKey, pool, 0, BigInt(Math.floor(Date.now() / 1000)))]);
  const marketKey = lev.market(mint.publicKey);
  check("create market", true, marketKey.toBase58());

  const updatePrices = async (seconds: number) => {
    const end = Date.now() + seconds * 1000;
    while (Date.now() < end) {
      await send([lev.updatePrice(mint.publicKey, pool)]).catch((e) => console.log("update failed", programError(e)));
      await sleep(9_000);
    }
  };

  // A price update before enough history exists must not allow trading.
  await send([lev.updatePrice(mint.publicKey, pool)]);
  await expectError("no trading without price history", [lev.openPosition(admin.publicKey, mint.publicKey, 9n, true, SOL / 200n, 3)], "StalePrice");

  // Spam protection: two updates in a row record only one observation.
  await send([lev.updatePrice(mint.publicKey, pool), lev.updatePrice(mint.publicKey, pool)]);
  const recorded = decodeMarket((await connection.getAccountInfo(marketKey))!.data).obs.filter((o) => o.ts > 0n).length;
  check("price spam ignored (8 s spacing)", recorded === 1, `${recorded} observation(s) recorded`);

  console.log("building ~100 s of price history...");
  await updatePrices(100);
  const m1 = decodeMarket((await connection.getAccountInfo(marketKey))!.data);
  result.poolSol = Number(m1.poolSol) / LAMPORTS_PER_SOL;
  check("pool SOL read from Meteora", m1.poolSol > SOL / 5n, `${Number(m1.poolSol) / LAMPORTS_PER_SOL} SOL`);

  // 5. Tier + cap rules. Tier 1 = 3x; cap = 5% of pool SOL.
  const margin = (SOL * 3n) / 1000n; // 0.003 SOL -> 0.009 SOL position at 3x
  await expectError("5x rejected on a 3x-tier coin", [lev.openPosition(admin.publicKey, mint.publicKey, 1n, true, margin, 5)], "TooMuchLeverage");

  await send([lev.openPosition(admin.publicKey, mint.publicKey, 1n, true, margin, 3)]);
  const pLong = decodePosition((await connection.getAccountInfo(lev.position(marketKey, admin.publicKey, 1n)))!.data);
  check("open 3x long", pLong.notional === margin * 3n && pLong.tier === 1, `tier ${pLong.tier}, size ${Number(pLong.notional) / LAMPORTS_PER_SOL} SOL`);

  const cap = (m1.poolSol * 500n) / 10_000n;
  const bigMargin = (cap / 3n) + 1_000n; // pushes total longs past the cap
  await expectError(
    "per-coin cap enforced",
    [lev.openPosition(admin.publicKey, mint.publicKey, 2n, true, bigMargin, 3)],
    "CapReached",
  );
  await expectError("close before hold time rejected", [lev.closePosition(admin.publicKey, mint.publicKey, 1n)], "HoldTime");

  // Pause blocks new positions only
  await send([lev.setParams(admin.publicKey, solUsd, true, admin.publicKey)]);
  await expectError("pause blocks new positions", [lev.openPosition(admin.publicKey, mint.publicKey, 3n, false, margin, 3)], "Paused");
  await send([lev.setParams(admin.publicKey, solUsd, false, admin.publicKey)]);

  await send([lev.openPosition(admin.publicKey, mint.publicKey, 4n, false, margin, 3)]);
  check("open 3x short", true, "nonce 4");
  await expectError("healthy position can't be liquidated", [lev.liquidate(admin.publicKey, admin.publicKey, mint.publicKey, 4n)], "NotLiquidatable");

  // 6. Close the long after the hold time (price unchanged)
  console.log("waiting out the 60 s hold time...");
  await updatePrices(65);
  const vaultBefore = await lamports(lev.vault);
  await send([lev.closePosition(admin.publicKey, mint.publicKey, 1n)]);
  const paid = vaultBefore - (await lamports(lev.vault));
  result.longPayout = Number(paid) / LAMPORTS_PER_SOL;
  // Price unchanged, so the trader gets margin back minus virtual price impact
  // (~3% each way at this size on a ~0.5 SOL pool) and 0.5% fees each way.
  check(
    "close long: paid from vault, less impact + fees",
    paid > margin / 2n && paid < margin,
    `margin ${Number(margin) / LAMPORTS_PER_SOL}, paid back ${Number(paid) / LAMPORTS_PER_SOL} SOL`,
  );
  check("position account closed", (await connection.getAccountInfo(lev.position(marketKey, admin.publicKey, 1n))) === null, "rent returned");

  // 7. Real pump until the coin is up >= 35% (0.5 SOL buys at a time), then
  // let the TWAP catch up and liquidate the 3x short.
  const sqrtNow = async () => (await dbc.state.getPool(pool))!.poolState.sqrtPrice as BN;
  const sqrtStart = await sqrtNow();
  const priceRatio = async () => {
    const s = await sqrtNow();
    return (Number(s.toString()) / Number(sqrtStart.toString())) ** 2;
  };
  let pumped = 0;
  while ((await priceRatio()) < 1.35 && pumped < 2) {
    await send(
      await dbc.pool.swap({
        owner: admin.publicKey,
        pool,
        amountIn: new BN(0.5 * LAMPORTS_PER_SOL),
        minimumAmountOut: new BN(1),
        swapBaseForQuote: false,
        referralTokenAccount: null,
      }),
    );
    pumped += 0.5;
  }
  const ratio = await priceRatio();
  result.pump = { solBought: pumped, priceUp: `${((ratio - 1) * 100).toFixed(1)}%` };
  check("real pump on Meteora", ratio >= 1.35, `bought ${pumped} SOL, price +${((ratio - 1) * 100).toFixed(1)}%`);
  console.log("letting the 60 s TWAP catch up...");
  await updatePrices(75);
  const liqBefore = await lamports(admin.publicKey);
  try {
    await send([lev.liquidate(admin.publicKey, admin.publicKey, mint.publicKey, 4n)]);
    check("short liquidated after pump", true, `liquidator balance change ${Number((await lamports(admin.publicKey)) - liqBefore) / LAMPORTS_PER_SOL} SOL (reward + rent - fee)`);
  } catch (e) {
    check("short liquidated after pump", false, programError(e) ?? (e as Error).message.split("\n")[0]);
    // keep the books clean for the next run
    await send([lev.closePosition(admin.publicKey, mint.publicKey, 4n)]).catch(() => {});
  }
  const vaultAfter = decodeVault((await connection.getAccountInfo(lev.vault))!.data);
  const mEnd = decodeMarket((await connection.getAccountInfo(marketKey))!.data);
  check("books balanced (no open interest left)", mEnd.oiLong === 0n && mEnd.oiShort === 0n, `long ${mEnd.oiLong}, short ${mEnd.oiShort}, locked margin ${vaultAfter.lockedMargin}`);

  // Recover most test SOL by selling the tokens back
  const ata = getAssociatedTokenAddressSync(mint.publicKey, admin.publicKey);
  const tokens = new BN((await connection.getTokenAccountBalance(ata)).value.amount);
  if (tokens.gtn(0)) {
    await send(
      await dbc.pool.swap({ owner: admin.publicKey, pool, amountIn: tokens, minimumAmountOut: new BN(1), swapBaseForQuote: true, referralTokenAccount: null }),
    ).catch(() => {});
  }
}

main()
  .catch((e) => check("run", false, (e as Error).stack ?? String(e)))
  .finally(() => {
    fs.writeFileSync("leverage-result.json", JSON.stringify(result, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
    const failed = checks.filter((c) => !c.ok).length;
    console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
    process.exit(failed ? 1 : 0);
  });

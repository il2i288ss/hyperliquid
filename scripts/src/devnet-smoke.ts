/**
 * End-to-end devnet test of the launchpad, using one funded wallet for
 * every role (admin, creator, trader, fee claimer):
 *
 *   1. create a partner config (same settings as production)
 *   2. launch a coin with a creator first buy
 *   3. check the fee schedule: ~90% in the launch slot, 3.75% after
 *   4. buy, then sell
 *   5. check partner fees accrued, claim them, claim the launch fee
 *
 *   ADMIN_KEYPAIR=./devnet.json RPC_URL=https://api.devnet.solana.com npm run smoke
 *
 * Writes smoke-result.json and exits non-zero if any check fails.
 */
import {
  Keypair,
  LAMPORTS_PER_SOL,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { NATIVE_MINT, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { deriveDbcPoolAddress } from "@meteora-ag/dynamic-bonding-curve-sdk";
import BN from "bn.js";
import fs from "node:fs";
import { connection, dbc, loadKeypair } from "./env.js";
import { curveConfig } from "./create-partner-config.js";
import { POOL_FEE_BPS, SNIPE_FEE_BPS } from "./platform.js";

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];
const result: Record<string, unknown> = { checks };
const check = (name: string, ok: boolean, detail: string) => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: ${detail}`);
};

const admin = loadKeypair("ADMIN_KEYPAIR");
const send = (tx: Transaction, extra: Keypair[] = []) =>
  sendAndConfirmTransaction(connection, tx, [admin, ...extra], { commitment: "confirmed" });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sol = (lamports: number | bigint | BN) => Number(lamports.toString()) / LAMPORTS_PER_SOL;

async function main() {
  const startBalance = await connection.getBalance(admin.publicKey);
  result.wallet = admin.publicKey.toBase58();
  console.log(`wallet ${admin.publicKey.toBase58()}  balance ${sol(startBalance)} SOL`);
  if (startBalance < 0.3 * LAMPORTS_PER_SOL) throw new Error("Need at least 0.3 devnet SOL");

  // 1. Partner config
  const config = Keypair.generate();
  const createConfigTx = await dbc.partner.createConfig({
    config: config.publicKey,
    feeClaimer: admin.publicKey,
    leftoverReceiver: admin.publicKey,
    payer: admin.publicKey,
    quoteMint: NATIVE_MINT,
    ...curveConfig(false),
  });
  result.configTx = await send(createConfigTx, [config]);
  result.config = config.publicKey.toBase58();
  check("create config", true, config.publicKey.toBase58());

  // 2. Launch with a 0.05 SOL creator first buy
  const mint = Keypair.generate();
  const balanceBeforeLaunch = await connection.getBalance(admin.publicKey);
  const launchTx = await dbc.creator.createPoolWithFirstBuy({
    createPoolParam: {
      baseMint: mint.publicKey,
      config: config.publicKey,
      name: "Smoke Test",
      symbol: "SMOKE",
      uri: "https://example.com/smoke.json",
      payer: admin.publicKey,
      poolCreator: admin.publicKey,
    },
    firstBuyParam: {
      buyer: admin.publicKey,
      buyAmount: new BN(0.05 * LAMPORTS_PER_SOL),
      minimumAmountOut: new BN(1),
      referralTokenAccount: null,
    },
  });
  result.launchTx = await send(launchTx, [mint]);
  result.mint = mint.publicKey.toBase58();
  const launchCost = balanceBeforeLaunch - (await connection.getBalance(admin.publicKey));
  result.launchCostSol = sol(launchCost);
  check("launch with first buy", true, `${mint.publicKey.toBase58()} (total cost ${sol(launchCost).toFixed(4)} SOL incl. 0.05 buy, 0.03 fee, rent)`);

  const pool = deriveDbcPoolAddress(NATIVE_MINT, mint.publicKey, config.publicKey);
  result.pool = pool.toBase58();
  const ata = getAssociatedTokenAddressSync(mint.publicKey, admin.publicKey);
  const firstBuyTokens = new BN((await connection.getTokenAccountBalance(ata)).value.amount);
  check("creator received tokens", firstBuyTokens.gtn(0), `${firstBuyTokens.toString()} raw units`);

  // 3. Fee schedule, read from the pool's real state
  const virtualPool = await dbc.state.getPool(pool);
  const poolConfig = await dbc.state.getPoolConfig(config.publicKey);
  if (!virtualPool || !poolConfig) throw new Error("pool or config not found after launch");
  const activation: BN = virtualPool.poolState.activationPoint;
  const quoteAt = (point: BN) => {
    const amountIn = new BN(0.1 * LAMPORTS_PER_SOL);
    const q = dbc.pool.swapQuote({
      virtualPool,
      config: poolConfig,
      swapBaseForQuote: false,
      amountIn,
      slippageBps: 100,
      hasReferral: false,
      eligibleForFirstSwapWithMinFee: false,
      currentPoint: point,
    });
    const fee = q.tradingFee.add(q.protocolFee);
    return (fee.toNumber() / amountIn.toNumber()) * 10_000; // bps
  };
  const launchSlotBps = quoteAt(activation);
  const laterBps = quoteAt(activation.addn(5));
  result.feeBps = { launchSlot: launchSlotBps, after: laterBps };
  check("90% fee in launch slot", Math.abs(launchSlotBps - SNIPE_FEE_BPS) <= 50, `${(launchSlotBps / 100).toFixed(2)}%`);
  check("3.75% fee after launch slot", Math.abs(laterBps - POOL_FEE_BPS) <= 5, `${(laterBps / 100).toFixed(2)}%`);

  // 4. Buy 0.05 SOL, then sell half the tokens
  await sleep(2_000); // be well past the launch slot
  const buyQuote = dbc.pool.swapQuote({
    virtualPool: (await dbc.state.getPool(pool))!,
    config: poolConfig,
    swapBaseForQuote: false,
    amountIn: new BN(0.05 * LAMPORTS_PER_SOL),
    slippageBps: 500,
    hasReferral: false,
    eligibleForFirstSwapWithMinFee: false,
    currentPoint: new BN(await connection.getSlot()),
  });
  result.buyTx = await send(
    await dbc.pool.swap({
      owner: admin.publicKey,
      pool,
      amountIn: new BN(0.05 * LAMPORTS_PER_SOL),
      minimumAmountOut: buyQuote.minimumAmountOut,
      swapBaseForQuote: false,
      referralTokenAccount: null,
    }),
  );
  const afterBuy = new BN((await connection.getTokenAccountBalance(ata)).value.amount);
  check("buy", afterBuy.gt(firstBuyTokens), `+${afterBuy.sub(firstBuyTokens).toString()} raw units`);

  const sellAmount = afterBuy.divn(2);
  result.sellTx = await send(
    await dbc.pool.swap({
      owner: admin.publicKey,
      pool,
      amountIn: sellAmount,
      minimumAmountOut: new BN(1),
      swapBaseForQuote: true,
      referralTokenAccount: null,
    }),
  );
  const afterSell = new BN((await connection.getTokenAccountBalance(ata)).value.amount);
  check("sell", afterSell.lt(afterBuy), `-${afterBuy.sub(afterSell).toString()} raw units`);

  // 5. Fees accrued to the platform, then claim them
  const metrics = await dbc.state.getPoolFeeMetrics(pool);
  const partnerFee = metrics.current.partnerQuoteFee;
  const creatorFee = metrics.current.creatorQuoteFee;
  result.partnerFeeSol = sol(partnerFee);
  check("platform fees accrued in SOL", partnerFee.gtn(0), `${sol(partnerFee)} SOL`);
  check("creator gets no fee share", creatorFee.isZero(), `${sol(creatorFee)} SOL`);

  const beforeClaim = await connection.getBalance(admin.publicKey);
  result.claimTx = await send(
    await dbc.partner.claimPartnerTradingFeeToReceiver({
      feeClaimer: admin.publicKey,
      payer: admin.publicKey,
      pool,
      receiver: admin.publicKey,
      maxBaseAmount: new BN("18446744073709551615"),
      maxQuoteAmount: new BN("18446744073709551615"),
    }),
  );
  const claimed = (await connection.getBalance(admin.publicKey)) - beforeClaim;
  check("claim trading fees", claimed > 0, `+${sol(claimed)} SOL (after tx fee)`);

  const beforeLaunchFee = await connection.getBalance(admin.publicKey);
  try {
    result.launchFeeTx = await send(
      await dbc.partner.claimPartnerPoolCreationFee({ pool, feeReceiver: admin.publicKey }),
    );
    const got = (await connection.getBalance(admin.publicKey)) - beforeLaunchFee;
    // 0.03 SOL minus Meteora's 10% = 0.027 SOL, minus the tx fee
    check("claim launch fee (~0.027 SOL)", Math.abs(sol(got) - 0.027) < 0.001, `+${sol(got)} SOL`);
  } catch (e) {
    check("claim launch fee (~0.027 SOL)", false, (e as Error).message.split("\n")[0]);
  }

  result.spentSol = sol(startBalance - (await connection.getBalance(admin.publicKey)));
}

main()
  .catch((e) => check("run", false, (e as Error).stack ?? String(e)))
  .finally(() => {
    fs.writeFileSync("smoke-result.json", JSON.stringify(result, null, 2));
    const failed = checks.filter((c) => !c.ok).length;
    console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
    process.exit(failed ? 1 : 0);
  });


/**
 * Devnet test of holder rewards, using the real snapshot + allocation code:
 *
 *   1. launch a coin (creator = admin, treated as a team wallet: excluded)
 *   2. three test holders buy different amounts (A > B > C)
 *   3. snapshot, then C sells half, snapshot again
 *   4. split a 0.01 SOL pot by time-weighted balance and pay it out
 *   5. check: pool/vault PDAs and team wallet excluded, payouts landed,
 *      shares match average holdings, C earned less for selling
 *
 *   ADMIN_KEYPAIR=./devnet.json RPC_URL=... npm run smoke:rewards
 */
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { NATIVE_MINT, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { deriveDbcPoolAddress } from "@meteora-ag/dynamic-bonding-curve-sdk";
import BN from "bn.js";
import fs from "node:fs";
import { connection, dbc, loadKeypair } from "./env.js";
import { curveConfig } from "./create-partner-config.js";
import { allocate, averageBalances, type Balances } from "./rewards/allocate.js";
import { holderBalances } from "./rewards/snapshot.js";

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];
const result: Record<string, unknown> = { checks };
const check = (name: string, ok: boolean, detail: string) => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: ${detail}`);
};
const admin = loadKeypair("ADMIN_KEYPAIR");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const send = (tx: Transaction, signers: Keypair[]) =>
  sendAndConfirmTransaction(connection, tx, signers, { commitment: "confirmed" });
const toMap = (r: Record<string, string>): Balances =>
  new Map(Object.entries(r).map(([k, v]) => [k, BigInt(v)]));

async function buy(who: Keypair, pool: PublicKey, lamports: number) {
  const tx = await dbc.pool.swap({
    owner: who.publicKey,
    pool,
    amountIn: new BN(lamports),
    minimumAmountOut: new BN(1),
    swapBaseForQuote: false,
    referralTokenAccount: null,
  });
  return send(tx, [who]);
}

async function main() {
  // 1. Launch
  const config = Keypair.generate();
  await send(
    await dbc.partner.createConfig({
      config: config.publicKey,
      feeClaimer: admin.publicKey,
      leftoverReceiver: admin.publicKey,
      payer: admin.publicKey,
      quoteMint: NATIVE_MINT,
      ...curveConfig(false),
    }),
    [admin, config],
  );
  const mint = Keypair.generate();
  await send(
    await dbc.creator.createPoolWithFirstBuy({
      createPoolParam: {
        baseMint: mint.publicKey,
        config: config.publicKey,
        name: "Rewards Test",
        symbol: "RWD",
        uri: "https://example.com/rwd.json",
        payer: admin.publicKey,
        poolCreator: admin.publicKey,
      },
      firstBuyParam: {
        buyer: admin.publicKey,
        buyAmount: new BN(0.02 * LAMPORTS_PER_SOL),
        minimumAmountOut: new BN(1),
        referralTokenAccount: null,
      },
    }),
    [admin, mint],
  );
  const pool = deriveDbcPoolAddress(NATIVE_MINT, mint.publicKey, config.publicKey);
  result.mint = mint.publicKey.toBase58();
  check("launch", true, mint.publicKey.toBase58());
  await sleep(1_500);

  // 2. Three holders buy different amounts
  const [A, B, C] = [Keypair.generate(), Keypair.generate(), Keypair.generate()];
  const fund = new Transaction();
  for (const [kp, sol] of [[A, 0.05], [B, 0.03], [C, 0.03]] as const) {
    fund.add(SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: kp.publicKey, lamports: sol * LAMPORTS_PER_SOL }));
  }
  await send(fund, [admin]);
  await buy(A, pool, 0.03 * LAMPORTS_PER_SOL);
  await buy(B, pool, 0.015 * LAMPORTS_PER_SOL);
  await buy(C, pool, 0.015 * LAMPORTS_PER_SOL);
  const names: Record<string, string> = {
    [A.publicKey.toBase58()]: "A",
    [B.publicKey.toBase58()]: "B",
    [C.publicKey.toBase58()]: "C",
  };
  check("3 holders bought", true, "A 0.03, B 0.015, C 0.015 SOL");

  // 3. Snapshot, C sells half, snapshot again
  const team = new Set([admin.publicKey.toBase58()]);
  const snap1 = await holderBalances(mint.publicKey, team);
  const cAta = getAssociatedTokenAddressSync(mint.publicKey, C.publicKey);
  const cTokens = new BN((await connection.getTokenAccountBalance(cAta)).value.amount);
  await send(
    await dbc.pool.swap({
      owner: C.publicKey,
      pool,
      amountIn: cTokens.divn(2),
      minimumAmountOut: new BN(1),
      swapBaseForQuote: true,
      referralTokenAccount: null,
    }),
    [C],
  );
  const snap2 = await holderBalances(mint.publicKey, team);
  result.snapshots = [snap1, snap2];

  const holders = Object.keys(snap1);
  check(
    "snapshot finds exactly the 3 holders",
    holders.length === 3 && holders.every((h) => names[h]),
    holders.map((h) => names[h] ?? `unexpected ${h}`).join(", "),
  );
  check("team wallet excluded", !(admin.publicKey.toBase58() in snap1), "creator/team wallet not in snapshot");
  check(
    "pool vault (program account) excluded",
    !Object.keys(snap1).some((o) => !PublicKey.isOnCurve(new PublicKey(o).toBytes())),
    "no program-owned wallets in snapshot",
  );

  // 4. Split a 0.01 SOL pot by time-weighted balance and pay it
  const avg = averageBalances([toMap(snap1), toMap(snap2)]);
  const pot = BigInt(0.01 * LAMPORTS_PER_SOL);
  const { payouts } = allocate(pot, avg, new Map(), 1_000n);
  const before = new Map<string, number>();
  for (const w of payouts.keys()) before.set(w, await connection.getBalance(new PublicKey(w)));
  const payTx = new Transaction();
  for (const [w, lamports] of payouts) {
    payTx.add(SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: new PublicKey(w), lamports }));
  }
  result.payoutTx = await send(payTx, [admin]);

  // 5. Verify
  let landed = true;
  const report: Record<string, string> = {};
  for (const [w, lamports] of payouts) {
    const got = (await connection.getBalance(new PublicKey(w))) - before.get(w)!;
    if (BigInt(got) !== lamports) landed = false;
    report[names[w]] = `${(Number(lamports) / LAMPORTS_PER_SOL).toFixed(6)} SOL`;
  }
  result.payouts = report;
  check("payouts landed exactly", landed, JSON.stringify(report));

  const totalAvg = [...avg.values()].reduce((a, b) => a + b, 0n);
  const sharesMatch = [...payouts].every(([w, p]) => {
    const expected = (pot * avg.get(w)!) / totalAvg;
    return p >= expected - 1n && p <= expected + 1n;
  });
  check("shares match average holdings", sharesMatch, "each payout = pot x avg balance / total");

  const paidTotal = [...payouts.values()].reduce((a, b) => a + b, 0n);
  check("whole pot paid out (rounding < 10 lamports)", pot - paidTotal < 10n, `${pot - paidTotal} lamports dust`);

  const [pA, pB, pC] = [A, B, C].map((k) => payouts.get(k.publicKey.toBase58()) ?? 0n);
  check("bigger holder earns more (A > B)", pA > pB, `A ${pA} > B ${pB}`);
  check("seller earns less than equal buyer (C < B)", pC < pB, `C ${pC} < B ${pB}`);

  // Return leftover test SOL to the admin wallet
  for (const kp of [A, B, C]) {
    const bal = await connection.getBalance(kp.publicKey);
    if (bal > 10_000) {
      await send(
        new Transaction().add(SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: admin.publicKey, lamports: bal - 5_000 })),
        [kp],
      ).catch(() => {});
    }
  }
}

main()
  .catch((e) => check("run", false, (e as Error).stack ?? String(e)))
  .finally(() => {
    fs.writeFileSync("rewards-result.json", JSON.stringify(result, null, 2));
    const failed = checks.filter((c) => !c.ok).length;
    console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
    process.exit(failed ? 1 : 0);
  });

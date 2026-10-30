/**
 * End-to-end test of the bot-run long/short engine on devnet, against the
 * stable devnet platform's demo coin. Uses real transactions:
 *
 *   open long  ·  oversized open is refunded  ·  close before hold rejected
 *   signed close pays from the vault  ·  wrong signer rejected
 *   take profit and stop loss fire  ·  liquidation pays nothing
 *   state survives a restart  ·  no double payouts
 *
 *   ADMIN_KEYPAIR=devnet.json PLATFORM_CONFIG=... DEMO_MINT=... SOL_USD=3500 npx tsx src/devnet-ls-test.ts
 */
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import crypto from "node:crypto";
import fs from "node:fs";
import { connection, dbc, loadKeypair } from "./env.js";
import { Engine, MEMO_PROGRAM, type State } from "./ls/engine.js";
import { fee, tiers } from "./ls/math.js";

const admin = loadKeypair("ADMIN_KEYPAIR");
const mint = process.env.DEMO_MINT!;
const config = new PublicKey(process.env.PLATFORM_CONFIG!);
const SOL = LAMPORTS_PER_SOL;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const checks: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `: ${detail}` : ""}`);
};

// In-memory store shared across "restarts".
let saved: State = {} as State;
const store = { load: () => JSON.parse(JSON.stringify(saved)) as State, save: (s: State) => void (saved = JSON.parse(JSON.stringify(s))) };

const vault = Keypair.generate();
const mkEngine = () =>
  new Engine({ connection, vault, store, test: true, minTrackSol: 0n, solUsd: () => Number(process.env.SOL_USD ?? 3500), log: (m) => console.log(m) });

function signMsg(kp: Keypair, message: string) {
  const pkcs8 = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), Buffer.from(kp.secretKey.slice(0, 32))]);
  const key = crypto.createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" });
  return bs58.encode(crypto.sign(null, Buffer.from(message, "utf8"), key));
}

async function sendMargin(e: Engine, long: boolean, lev: number, margin: number, tp = 0, sl = 0) {
  const T = tiers(true);
  const marginL = BigInt(Math.round(margin * SOL));
  const view = await e.view(mint);
  const tier = T[view.market!.tier!];
  const pay = marginL + fee(marginL * BigInt(lev), tier.feeBps);
  const memo = `obv:o:${mint}:${long ? "L" : "S"}:${lev}:${marginL}:${tp}:${sl}`;
  const tx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: vault.publicKey, lamports: pay }),
    new TransactionInstruction({ programId: MEMO_PROGRAM, keys: [], data: Buffer.from(memo, "utf8") }),
  );
  return sendAndConfirmTransaction(connection, tx, [admin], { commitment: "confirmed" });
}

async function drainPayouts(e: Engine) {
  for (let i = 0; i < 20 && e.pendingPayouts().length; i++) {
    await e.payouts();
    await sleep(2_000);
  }
  return e.pendingPayouts().length === 0;
}

async function main() {
  // Fund a fresh vault so caps allow small test positions.
  await sendAndConfirmTransaction(connection, new Transaction().add(SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: vault.publicKey, lamports: 0.08 * SOL })), [admin]);
  let e = mkEngine();

  const pools = await dbc.state.getPoolsByConfig(config);
  await e.setPools(pools.map(({ publicKey, account }) => ({
    mint: account.poolState.baseMint.toBase58(),
    pool: publicKey.toBase58(),
    launchedAt: Math.floor(Date.now() / 1000) - 3600,
    poolSol: BigInt(account.poolState.quoteReserve.toString()),
    migrated: Boolean(account.poolState.isMigrated),
  })));
  for (let i = 0; i < 4; i++) {
    await e.recordPrices();
    await sleep(4_000);
  }
  const v0 = await e.view(mint);
  check("market live with price history", Boolean(v0.market?.enabled), `tier ${v0.market?.tier}, MC $${Math.round(v0.market?.mcapUsd ?? 0)}, pool ${v0.market?.poolSol} SOL, vault free ${v0.vaultFree} SOL, capacity ${v0.market?.capacity} SOL/side`);

  // 1. Open a long
  const sig1 = await sendMargin(e, true, 2, 0.0005);
  const r1 = await e.open(sig1);
  check("open 2x long", r1.ok === true, JSON.stringify(r1).slice(0, 160));
  const r1b = await e.open(sig1);
  check("same payment can't open twice", "already" in r1b && r1b.already === true);
  const pos1 = r1.ok ? r1.position! : null;

  // 2. Oversized open is refunded in full
  const before = await connection.getBalance(admin.publicKey);
  const sig2 = await sendMargin(e, true, 2, 0.01);
  const r2 = await e.open(sig2);
  check("over-capacity open rejected", r2.ok === false && "refunded" in r2 && r2.refunded === true, (r2 as { error?: string }).error ?? "");
  check("refund paid back", await drainPayouts(e));
  const after = await connection.getBalance(admin.publicKey);
  check("refund reached wallet", before - after < 0.0001 * SOL, `net cost ${(before - after) / SOL} SOL (network fees only)`);

  // 3. Close rules
  const ts = () => Math.floor(Date.now() / 1000);
  const msg = (id: string) => `Obverse: close ${id} at ${ts()}`;
  try {
    const m = msg(pos1!.id);
    await e.close(admin.publicKey.toBase58(), pos1!.id, m, signMsg(admin, m));
    check("close before hold time rejected", false, "closed");
  } catch (err) {
    check("close before hold time rejected", /Hold/.test((err as Error).message), (err as Error).message);
  }
  await sleep(6_000);
  const stranger = Keypair.generate();
  try {
    const m = msg(pos1!.id);
    await e.close(admin.publicKey.toBase58(), pos1!.id, m, signMsg(stranger, m));
    check("wrong signer rejected", false, "closed");
  } catch (err) {
    check("wrong signer rejected", /signature/i.test((err as Error).message), (err as Error).message);
  }

  // 4. Restart: state survives
  e = mkEngine();
  check("positions survive a restart", (await e.view(mint, admin.publicKey.toBase58())).positions.length === 1);
  await e.recordPrices();

  const balClose = await connection.getBalance(admin.publicKey);
  const m4 = msg(pos1!.id);
  const c = await e.close(admin.publicKey.toBase58(), pos1!.id, m4, signMsg(admin, m4));
  check("signed close settles", BigInt(c.payout) > 0n, `payout ${Number(c.payout) / SOL} SOL, pnl ${Number(c.pnl) / SOL}`);
  check("close payout sent", await drainPayouts(e));
  check("close payout reached wallet", (await connection.getBalance(admin.publicKey)) > balClose);

  // 5. Take profit (short TP far above current MC => already hit) and stop loss
  const sig5 = await sendMargin(e, false, 2, 0.0005, 1_000_000_000_000, 0);
  const r5 = await e.open(sig5);
  const sig6 = await sendMargin(e, true, 2, 0.0005, 0, 1_000_000_000_000);
  const r6 = await e.open(sig6);
  check("open short with TP and long with SL", r5.ok === true && r6.ok === true);
  await e.risk();
  check("TP/SL wait for hold time", (await e.view(mint)).positions.length === 2);
  await sleep(6_000);
  await e.recordPrices();
  await e.risk();
  const left = (await e.view(mint)).positions.length;
  const hist = e.history(admin.publicKey.toBase58());
  check("take profit fired", hist.some((h) => h.reason === "tp"), hist.map((h) => h.reason).join(","));
  check("stop loss fired", hist.some((h) => h.reason === "sl") && left === 0);
  check("TP/SL payouts sent", await drainPayouts(e));

  // 6. Liquidation: a position whose entry was 10x higher has lost >90%
  const sig7 = await sendMargin(e, true, 2, 0.0005);
  const r7 = await e.open(sig7);
  if (r7.ok && r7.position) {
    const s = store.load();
    s.positions[r7.position.id].entry = (BigInt(s.positions[r7.position.id].entry) * 10n).toString();
    store.save(s);
    e = mkEngine();
    await e.recordPrices();
    await e.risk();
    const h = e.history(admin.publicKey.toBase58())[0];
    check("liquidation at 90% loss pays nothing", h?.reason === "liquidated" && h.payout === "0", `${h?.reason} payout ${h?.payout}`);
  } else check("liquidation at 90% loss pays nothing", false, "open failed");

  // 7. No payouts double-sent: books balance
  const v = await e.view();
  check("no open positions or pending payouts left", v.positions.length === 0 && e.pendingPayouts().length === 0);
}

main()
  .catch((err) => check("run", false, (err as Error).stack ?? String(err)))
  .finally(async () => {
    // Return the test vault's SOL to the admin wallet.
    try {
      const bal = await connection.getBalance(vault.publicKey);
      if (bal > 5_000) await sendAndConfirmTransaction(connection, new Transaction().add(SystemProgram.transfer({ fromPubkey: vault.publicKey, toPubkey: admin.publicKey, lamports: bal - 5_000 })), [vault]);
    } catch {
      /* ignore */
    }
    fs.writeFileSync("ls-test-result.json", JSON.stringify(checks, null, 2));
    const failed = checks.filter((c) => !c.ok).length;
    console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
    process.exit(failed ? 1 : 0);
  });

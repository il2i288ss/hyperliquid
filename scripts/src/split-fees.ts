/**
 * Splits the SOL sitting in the fee splitter wallet:
 *   1/3     -> holder rewards pot (airdropped by rewards/)
 *   0.1/3   -> treasury
 *   1.9/3   -> long/short vault (program-owned, no withdraw)
 *
 *   npx tsx src/split-fees.ts
 *
 * Later upgrade: replace this wallet with an on-chain splitter program so
 * anyone can verify the percentages.
 */
import {
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { connection, loadKeypair, pubkey, pubkeyOr } from "./env.js";
import { splitLamports, TREASURY_ADDRESS } from "./platform.js";
import { consumeLaunchFees, peekLaunchFees } from "./rewards/store.js";

const KEEP_FOR_TX_FEES = 10_000_000n; // keep 0.01 SOL for claim tx fees

export async function splitFees() {
  const splitter = loadKeypair("FEE_SPLITTER_KEYPAIR");
  const balance = BigInt(await connection.getBalance(splitter.publicKey));
  const available = balance - KEEP_FOR_TX_FEES;
  if (available <= 0n) return console.log("Nothing to split.");

  // Launch fees (0.03 SOL each) go straight to treasury; trading fees split.
  const launchFees = peekLaunchFees();
  const launch = launchFees < available ? launchFees : available;
  const distributable = available - launch;
  const parts = splitLamports(distributable);
  parts.treasury += launch;
  const tx = new Transaction();
  const add = (to: ReturnType<typeof pubkey>, lamports: bigint) => {
    if (lamports > 0n)
      tx.add(SystemProgram.transfer({ fromPubkey: splitter.publicKey, toPubkey: to, lamports }));
  };
  add(pubkey("HOLDER_POT_WALLET"), parts.holders);
  add(pubkeyOr("TREASURY_WALLET", TREASURY_ADDRESS), parts.treasury);
  // Vault PDA from the leverage program. Anyone can send SOL in;
  // only the program can pay it out, and only to winning positions.
  add(pubkey("LEVERAGE_VAULT_PDA"), parts.vault);

  const sig = await sendAndConfirmTransaction(connection, tx, [splitter]);
  consumeLaunchFees(launch);
  const sol = (x: bigint) => (Number(x) / LAMPORTS_PER_SOL).toFixed(4);
  console.log(
    `Split ${sol(distributable)} SOL -> holders ${sol(parts.holders)}, treasury ${sol(parts.treasury)}, vault ${sol(parts.vault)}\ntx: ${sig}`,
  );
}

if (process.argv[1]?.endsWith("split-fees.ts")) {
  splitFees().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

/**
 * Devnet only: set the SOL/USD rate the long/short program (and the site)
 * use for market caps and tiers. A high rate lets testers reach the $100K+
 * tiers with a few devnet SOL. Keeps the current keeper; unpauses.
 *
 *   SOL_USD=3000 LEVERAGE_PROGRAM_ID=... npx tsx src/devnet-set-params.ts
 */
import { PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { connection, loadKeypair } from "./env.js";
import { LeverageClient } from "./leverage/client.js";

async function main() {
  if (!/devnet/i.test(process.env.RPC_URL ?? "")) throw new Error("Refusing to run: RPC_URL is not devnet");
  const admin = loadKeypair("ADMIN_KEYPAIR");
  const lev = new LeverageClient(new PublicKey(process.env.LEVERAGE_PROGRAM_ID!));
  const info = await connection.getAccountInfo(lev.global);
  if (!info) throw new Error("Long/short program not initialized");
  const keeper = new PublicKey(info.data.subarray(8 + 32, 8 + 64)); // Global: disc, admin, keeper
  const solUsd = Number(process.env.SOL_USD ?? "150");
  const tx = new Transaction().add(lev.setParams(admin.publicKey, BigInt(Math.round(solUsd * 1e6)), false, keeper));
  const sig = await sendAndConfirmTransaction(connection, tx, [admin], { commitment: "confirmed" });
  console.log(`SOL/USD set to $${solUsd} (keeper ${keeper.toBase58()}): ${sig}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

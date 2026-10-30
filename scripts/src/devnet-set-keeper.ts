/**
 * Authorizes a keeper wallet on the devnet long/short program and gives it
 * some devnet SOL for transaction fees. Run by the "Devnet set keeper" workflow.
 *
 *   KEEPER_PUBKEY=... LEVERAGE_PROGRAM_ID=... npx tsx src/devnet-set-keeper.ts
 */
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { connection, loadKeypair } from "./env.js";
import { LeverageClient } from "./leverage/client.js";

async function main() {
  const admin = loadKeypair("ADMIN_KEYPAIR");
  const keeper = new PublicKey(process.env.KEEPER_PUBKEY!);
  const lev = new LeverageClient(new PublicKey(process.env.LEVERAGE_PROGRAM_ID!));
  const tx = new Transaction().add(lev.setParams(admin.publicKey, 150_000_000n, false, keeper));
  if ((await connection.getBalance(keeper)) < 0.3 * LAMPORTS_PER_SOL) {
    tx.add(SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: keeper, lamports: 0.5 * LAMPORTS_PER_SOL }));
  }
  const sig = await sendAndConfirmTransaction(connection, tx, [admin], { commitment: "confirmed" });
  console.log(`keeper ${keeper.toBase58()} authorized and funded: ${sig}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

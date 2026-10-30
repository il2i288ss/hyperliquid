/**
 * One-time start of the long/short program on mainnet, after it's deployed:
 * creates its settings (admin + keeper = the fee bot) and the vault, using
 * today's SOL/USD price. Safe to re-run: it skips what already exists.
 *
 *   RPC_URL=... ADMIN_KEYPAIR=fee-bot.json LEVERAGE_PROGRAM_ID=... npx tsx src/mainnet-longshort-init.ts
 */
import { PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { connection, loadKeypair } from "./env.js";
import { LeverageClient } from "./leverage/client.js";
import { solUsdNow } from "./sol-price.js";

const admin = loadKeypair("ADMIN_KEYPAIR");
const lev = new LeverageClient(new PublicKey(process.env.LEVERAGE_PROGRAM_ID!));

const g = await connection.getAccountInfo(lev.global);
if (g) {
  console.log("Long/short program already started.");
} else {
  const price = await solUsdNow();
  await sendAndConfirmTransaction(connection, new Transaction().add(lev.initialize(admin.publicKey, BigInt(Math.round(price * 1e6)))), [admin], {
    commitment: "confirmed",
  });
  console.log(`Started the long/short program (SOL = $${price.toFixed(2)}).`);
}
const info = (await connection.getAccountInfo(lev.global))!;
const testBuild = info.data[8 + 32 + 32 + 8 + 1] === 1;
if (testBuild) throw new Error("This is the devnet TEST build. Do not use it on mainnet.");
console.log(`VAULT=${lev.vault.toBase58()}`);
console.log(`vault balance: ${(await connection.getBalance(lev.vault)) / 1e9} SOL`);

/**
 * Move all SOL from old keypair files to a new address (used when rotating
 * exposed bot wallets): npx tsx src/sweep.ts <toAddress> <oldKey.json>...
 */
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import fs from "node:fs";

const connection = new Connection(process.env.RPC_URL!, "confirmed");
const to = new PublicKey(process.argv[2]);

for (const file of process.argv.slice(3)) {
  if (!fs.existsSync(file)) continue;
  const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(file, "utf8"))));
  const bal = await connection.getBalance(kp.publicKey);
  const send = bal - 5_000; // leave the network fee
  if (send <= 0) continue;
  const sig = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: to, lamports: send })),
    [kp],
  );
  console.log(`moved ${send / 1e9} SOL from ${kp.publicKey.toBase58()} (${sig})`);
}

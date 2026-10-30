/**
 * Makes sure a funded devnet wallet exists at the given path.
 * If the file is missing, creates a throwaway keypair and asks the devnet
 * faucet for SOL. Devnet SOL has no value.
 *
 *   npx tsx src/devnet-wallet.ts ./devnet.json [minSol]
 */
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import fs from "node:fs";

const path = process.argv[2] ?? "devnet.json";
const minSol = Number(process.argv[3] ?? "1");
const connection = new Connection(process.env.RPC_URL ?? "https://api.devnet.solana.com", "confirmed");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let kp: Keypair;
  if (fs.existsSync(path)) {
    kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path, "utf8"))));
  } else {
    kp = Keypair.generate();
    fs.writeFileSync(path, JSON.stringify(Array.from(kp.secretKey)), { mode: 0o600 });
    console.log("created throwaway devnet wallet");
  }
  console.log(`wallet ${kp.publicKey.toBase58()}`);

  for (let attempt = 1; attempt <= 6; attempt++) {
    const balance = await connection.getBalance(kp.publicKey);
    console.log(`balance ${balance / LAMPORTS_PER_SOL} SOL`);
    if (balance >= minSol * LAMPORTS_PER_SOL) return;
    try {
      const sig = await connection.requestAirdrop(kp.publicKey, 1 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig, "confirmed");
      console.log("airdropped 1 SOL");
    } catch (e) {
      console.log(`faucet refused (attempt ${attempt}): ${(e as Error).message.split("\n")[0]}`);
      await sleep(5_000 * attempt);
    }
  }
  const final = await connection.getBalance(kp.publicKey);
  if (final < minSol * LAMPORTS_PER_SOL) {
    console.error(
      `Not enough devnet SOL. Send some to ${kp.publicKey.toBase58()} from https://faucet.solana.com and re-run.`,
    );
    process.exit(1);
  }
}

main();

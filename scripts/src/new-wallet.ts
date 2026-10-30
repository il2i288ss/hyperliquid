/** Create a keypair file and print its address: npx tsx src/new-wallet.ts <path> */
import { Keypair } from "@solana/web3.js";
import fs from "node:fs";

const kp = Keypair.generate();
fs.writeFileSync(process.argv[2], JSON.stringify(Array.from(kp.secretKey)), { mode: 0o600 });
console.log(kp.publicKey.toBase58());

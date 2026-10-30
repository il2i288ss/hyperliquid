/** Wait until an address holds at least <minSol>: npx tsx src/wait-balance.ts <address> <minSol> */
import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

const connection = new Connection(process.env.RPC_URL!, "confirmed");
const address = new PublicKey(process.argv[2]);
const min = Number(process.argv[3]) * LAMPORTS_PER_SOL;

for (;;) {
  let bal = 0;
  try {
    bal = await connection.getBalance(address);
  } catch (e) {
    console.log(`\nRPC error: ${(e as Error).message.split("\n")[0]}`);
  }
  if (bal >= min) {
    console.log(`received ${bal / LAMPORTS_PER_SOL} SOL`);
    break;
  }
  process.stdout.write(`\rwaiting for SOL… balance ${(bal / LAMPORTS_PER_SOL).toFixed(4)} SOL   `);
  await new Promise((r) => setTimeout(r, 5_000));
}

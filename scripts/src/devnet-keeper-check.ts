/**
 * After the keeper ran for a while on devnet: was the demo coin registered
 * for long/short, and is its price history being recorded?
 *
 *   DEMO_MINT=... npx tsx src/devnet-keeper-check.ts
 */
import { PublicKey } from "@solana/web3.js";
import fs from "node:fs";
import { connection } from "./env.js";
import { LeverageClient, decodeMarket } from "./leverage/client.js";

const lev = new LeverageClient(new PublicKey(process.env.LEVERAGE_PROGRAM_ID!));
const mint = new PublicKey(process.env.DEMO_MINT!);

async function main() {
  const info = await connection.getAccountInfo(lev.market(mint));
  const checks: { name: string; ok: boolean; detail: string }[] = [];
  if (!info) {
    checks.push({ name: "keeper registered demo coin", ok: false, detail: "no market account" });
  } else {
    const m = decodeMarket(info.data as Buffer);
    const obs = m.obs.filter((o) => o.ts > 0n).length;
    checks.push({ name: "keeper registered demo coin", ok: true, detail: lev.market(mint).toBase58() });
    checks.push({ name: "long/short enabled", ok: m.enabled, detail: String(m.enabled) });
    checks.push({ name: "keeper recorded prices", ok: obs >= 3, detail: `${obs} observations` });
    checks.push({ name: "pool SOL tracked", ok: m.poolSol > 0n, detail: `${Number(m.poolSol) / 1e9} SOL` });
  }
  for (const c of checks) console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name}: ${c.detail}`);
  fs.writeFileSync("keeper-result.json", JSON.stringify({ mint: mint.toBase58(), checks }, null, 2));
  process.exit(checks.every((c) => c.ok) ? 0 : 1);
}

main();

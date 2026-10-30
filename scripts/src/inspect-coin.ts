/**
 * Read-only check of one launched coin on mainnet:
 *   MINT=... RPC_URL=... npx tsx src/inspect-coin.ts
 * Prints the mint, metadata, its Meteora pool, fees waiting to be claimed,
 * and the platform wallets' balances. Sends nothing.
 */
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import { deriveDbcPoolAddress } from "@meteora-ag/dynamic-bonding-curve-sdk";
import { connection, dbc } from "./env.js";
import { TREASURY_ADDRESS } from "./platform.js";

const mint = new PublicKey(process.env.MINT!);
const CONFIGS: Record<string, string> = {
  platform: "BL4RJziEMjC7aTv4pHdjm5eWB7KZKMYK3AM3jVkHLihe",
  "main coin": "GpESQwWJgHsmWfk2sD28GzZt2xZLMeT2WKhBiqnBevCL",
};
const WALLETS: Record<string, string> = {
  treasury: TREASURY_ADDRESS,
  "fee bot": "9pBN6Hm5xm1KLB43eKi5kh5cNQT2JofADzfu6biT9tgf",
  "payout bot": "GAgWc9yXCNW6seSTzHsrUABhqcGEEsjtVRJgvDv4DjRQ",
  "vault reserve": "8o3aPx6YiuGxx61hCmDCMfJLYzt6kcnhg8hFk1eBtTff",
};
const plain = (v: unknown): unknown =>
  v && typeof v === "object"
    ? "toBase58" in (v as object)
      ? (v as PublicKey).toBase58()
      : "toString" in (v as object) && (v as { constructor: { name: string } }).constructor.name === "BN"
        ? (v as { toString(): string }).toString()
        : Array.isArray(v)
          ? v.map(plain)
          : Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, plain(x)]))
    : v;
const sol = (lamports: number | bigint | string) => (Number(lamports) / LAMPORTS_PER_SOL).toFixed(6);

const info = await connection.getParsedAccountInfo(mint);
if (!info.value) {
  console.log(`MINT NOT FOUND on this network (${process.env.RPC_URL})`);
  process.exit(0);
}
console.log("== Mint ==");
console.log(JSON.stringify((info.value.data as { parsed?: unknown }).parsed ?? "not a token mint", null, 2));

const [metaPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("metadata"), new PublicKey("metaqbxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx").toBuffer(), mint.toBuffer()],
  new PublicKey("metaqbxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"),
);
const meta = await connection.getAccountInfo(metaPda);
if (meta) {
  const d = meta.data;
  let o = 65;
  const str = () => {
    const n = d.readUInt32LE(o);
    const s = d.subarray(o + 4, o + 4 + n).toString("utf8").replace(/\0/g, "");
    o += 4 + n;
    return s;
  };
  console.log(`\n== Metadata ==\nname: ${str()}\nsymbol: ${str()}\nuri: ${str()}`);
}

for (const [label, cfg] of Object.entries(CONFIGS)) {
  const pool = deriveDbcPoolAddress(NATIVE_MINT, mint, new PublicKey(cfg));
  const p = await dbc.state.getPool(pool).catch(() => null);
  if (!p) continue;
  const s = (p as { poolState?: Record<string, unknown> }).poolState ?? (p as Record<string, unknown>);
  console.log(`\n== Pool (${label} config ${cfg}) ==\npool: ${pool.toBase58()}`);
  const sqrt = Number(String(s.sqrtPrice)) / 2 ** 64;
  const priceSolPerToken = (sqrt * sqrt) / 1e3; // 6-decimal token, 9-decimal SOL
  console.log(`SOL in curve: ${sol(String(s.quoteReserve))}`);
  console.log(`price: ${priceSolPerToken.toExponential(4)} SOL/token, mcap ≈ ${(priceSolPerToken * 1e9).toFixed(2)} SOL`);
  console.log(`migrated: ${s.isMigrated}`);
  console.log(JSON.stringify(plain(s), null, 2));
  const fees = await dbc.state.getPoolFeeMetrics(pool).catch((e: Error) => `fee metrics error: ${e.message}`);
  console.log("\n== Fees waiting in the pool ==\n" + JSON.stringify(plain(fees), null, 2));

  const sigs = await connection.getSignaturesForAddress(pool, { limit: 50 });
  console.log(`\n== Pool transactions (${sigs.length}, newest first) ==`);
  for (const x of sigs) console.log(`${x.blockTime ? new Date(x.blockTime * 1000).toISOString() : "?"} ${x.err ? "FAILED" : "ok"} ${x.signature}`);
}

console.log("\n== Platform wallets ==");
for (const [label, a] of Object.entries(WALLETS)) console.log(`${label.padEnd(14)} ${a}  ${sol(await connection.getBalance(new PublicKey(a)))} SOL`);

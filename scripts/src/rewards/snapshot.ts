/**
 * Records every holder's balance for each coin that has rewards waiting.
 * Run every 3 minutes at a random offset (see README cron example), so each
 * 15-minute payout averages ~5 snapshots and nobody can time a buy right
 * before one.
 *
 *   npx tsx src/rewards/snapshot.ts
 */
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { connection } from "../env.js";
import { read, write, type Ledger } from "./store.js";

/** Wallets that never earn rewards (pools, vault, treasury, team...). */
const list = (v?: string) => new Set((v ?? "").split(",").map((x) => x.trim()).filter(Boolean));
const EXCLUDED = list(process.env.REWARD_EXCLUDED);
/** Program-owned wallets that SHOULD earn (e.g. a holder's Squads multisig). */
const INCLUDED = list(process.env.REWARD_INCLUDED);

export async function holderBalances(
  mint: PublicKey,
  alsoExclude: Set<string> = new Set(),
): Promise<Record<string, string>> {
  const accounts = await connection.getParsedProgramAccounts(TOKEN_PROGRAM_ID, {
    filters: [{ dataSize: 165 }, { memcmp: { offset: 0, bytes: mint.toBase58() } }],
  });
  const out: Record<string, bigint> = {};
  for (const { account } of accounts) {
    const info = (account.data as any).parsed?.info;
    const owner: string | undefined = info?.owner;
    const amount = BigInt(info?.tokenAmount?.amount ?? "0");
    if (!owner || amount === 0n || EXCLUDED.has(owner) || alsoExclude.has(owner)) continue;
    // Program-owned addresses (PDAs) are pools, vaults and lockers, not
    // people: skip them. (This also skips multisig wallets; whitelist them
    // via REWARD_INCLUDED if needed.)
    if (!INCLUDED.has(owner) && !PublicKey.isOnCurve(new PublicKey(owner).toBytes())) continue;
    out[owner] = (out[owner] ?? 0n) + amount;
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.toString()]));
}

export async function snapshotAll() {
  const ledger = read<Ledger>("ledger.json", {});
  const mints = Object.keys(ledger).filter((m) => BigInt(ledger[m].holdersDue) > 0n);
  for (const mint of mints) {
    const balances = await holderBalances(new PublicKey(mint));
    const snaps = read<{ ts: number; balances: Record<string, string> }[]>(`snapshots-${mint}.json`, []);
    snaps.push({ ts: Date.now(), balances });
    write(`snapshots-${mint}.json`, snaps);
    console.log(`${mint}: ${Object.keys(balances).length} holders`);
  }
}

if (process.argv[1]?.endsWith("snapshot.ts")) {
  snapshotAll().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

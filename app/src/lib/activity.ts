/**
 * Recent trades and top holders for a coin, read straight from the chain
 * (no database needed). Trades come from the pool's own vault balances in
 * each transaction, so amounts are exact: SOL that entered or left the
 * curve, and tokens that left or entered it.
 */
import { Connection, PublicKey, type ParsedTransactionWithMeta, type TokenBalance } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import { deriveDbcPoolAuthority } from "@meteora-ag/dynamic-bonding-curve-sdk";
import bs58 from "bs58";
import { RPC_URL, TOTAL_SUPPLY } from "./config";

export type Trade = {
  sig: string;
  time: number; // unix seconds
  slot: number;
  side: "buy" | "sell";
  sol: number;
  tokens: number;
  priceSol: number;
  /** Pool price right after this trade (SOL per token), from Meteora's own swap event. 0 if unknown. */
  postPriceSol: number;
  trader: string;
};

export type Holder = { owner: string; tokens: number; pct: number; label?: string };

const POOL_AUTHORITY = deriveDbcPoolAuthority().toBase58();
const connection = () => new Connection(RPC_URL, "confirmed");

/** Change in the pool-authority-owned balance of `mint` in one transaction. */
function poolDelta(tx: ParsedTransactionWithMeta, mint: string) {
  const sum = (list?: TokenBalance[] | null) =>
    (list ?? [])
      .filter((b) => b.mint === mint && b.owner === POOL_AUTHORITY)
      .reduce((a, b) => a + Number(b.uiTokenAmount.uiAmount ?? 0), 0);
  return sum(tx.meta?.postTokenBalances) - sum(tx.meta?.preTokenBalances);
}

/** Meteora DBC swap events: EvtSwap (v1) and EvtSwap2 (v2). */
const EVT_SWAP = Buffer.from([27, 60, 21, 213, 138, 170, 187, 147]);
const EVT_SWAP2 = Buffer.from([189, 66, 51, 168, 38, 80, 117, 153]);
const EVT_SWAP2_HOOK = Buffer.from([134, 59, 168, 120, 94, 51, 114, 231]);

const u128 = (b: Buffer, o: number) => b.readBigUInt64LE(o) + (b.readBigUInt64LE(o + 8) << 64n);
/** SOL per whole token from a Q64.64 sqrt price (6-decimal token, 9-decimal SOL). */
export const priceFromSqrtQ64 = (sqrt: bigint) => {
  const s = Number(sqrt) / 2 ** 64;
  return (s * s) / 1e3;
};

/** next_sqrt_price from a swap event body (after the 8-byte discriminator). */
function sqrtFromEvent(b: Buffer, pool: Buffer): bigint | null {
  for (let i = 0; i + 8 <= b.length; i++) {
    const disc = b.subarray(i, i + 8);
    const v2 = disc.equals(EVT_SWAP2) || disc.equals(EVT_SWAP2_HOOK);
    const v1 = disc.equals(EVT_SWAP);
    if (!v1 && !v2) continue;
    const body = b.subarray(i + 8);
    if (!body.subarray(0, 32).equals(pool)) continue;
    // v2: pool, config, dir u8, referral u8, params(u64,u64,u8), result(u64 x4, sqrt u128, …)
    // v1: pool, config, dir u8, referral u8, params(u64,u64), result(u64,u64, sqrt u128, …)
    const off = v2 ? 115 : 98;
    if (body.length >= off + 16) return u128(body, off);
  }
  return null;
}

/** The pool's price after the swap, read from Meteora's event (logs or self-CPI). */
function postPrice(tx: ParsedTransactionWithMeta, pool: Buffer): number {
  for (const line of tx.meta?.logMessages ?? []) {
    if (!line.startsWith("Program data: ")) continue;
    const s = sqrtFromEvent(Buffer.from(line.slice(14), "base64"), pool);
    if (s) return priceFromSqrtQ64(s);
  }
  for (const inner of tx.meta?.innerInstructions ?? []) {
    for (const ix of inner.instructions) {
      if (!("data" in ix) || typeof ix.data !== "string") continue;
      try {
        const s = sqrtFromEvent(Buffer.from(bs58.decode(ix.data)), pool);
        if (s) return priceFromSqrtQ64(s);
      } catch {
        /* not base58 */
      }
    }
  }
  return 0;
}

/**
 * Every trade a pool has had, kept per server instance and topped up with
 * only the new transactions on each call, so refreshes are cheap and fast.
 */
const tradeCache = new Map<string, { at: number; newest?: string; trades: Trade[]; busy?: Promise<Trade[]> }>();
const MAX_HISTORY = 3000;

export async function recentTrades(pool: string, mint: string): Promise<Trade[]> {
  const hit = tradeCache.get(pool);
  if (hit?.busy) return hit.busy;
  if (hit && Date.now() - hit.at < 1_000) return hit.trades;
  const entry = hit ?? { at: 0, trades: [] as Trade[] };
  tradeCache.set(pool, entry);
  entry.busy = loadTrades(pool, mint, entry).finally(() => { entry.busy = undefined; });
  return entry.busy;
}

async function loadTrades(pool: string, mint: string, entry: { at: number; newest?: string; trades: Trade[] }): Promise<Trade[]> {
  const conn = connection();
  const poolKey = new PublicKey(pool);
  // New signatures since the last call (all history, paged, on the first call).
  const fresh: Awaited<ReturnType<Connection["getSignaturesForAddress"]>> = [];
  let before: string | undefined;
  for (;;) {
    const page = await conn.getSignaturesForAddress(poolKey, { limit: 1000, before, until: entry.newest });
    fresh.push(...page);
    if (page.length < 1000 || fresh.length >= MAX_HISTORY) break;
    before = page[page.length - 1].signature;
  }
  if (!fresh.length) {
    entry.at = Date.now();
    return entry.trades;
  }
  const sigs = fresh.filter((s) => !s.err);
  const poolBuf = poolKey.toBuffer();
  const txs: (ParsedTransactionWithMeta | null)[] = [];
  for (let i = 0; i < sigs.length; i += 50) {
    txs.push(
      ...(await conn.getParsedTransactions(sigs.slice(i, i + 50).map((s) => s.signature), {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      })),
    );
  }
  const sol = NATIVE_MINT.toBase58();
  const trades: Trade[] = [];
  txs.forEach((tx, i) => {
    if (!tx?.meta || tx.meta.err) return;
    const dToken = poolDelta(tx, mint);
    const dSol = poolDelta(tx, sol);
    if (Math.abs(dToken) < 1e-9 || Math.abs(dSol) < 1e-12) return; // not a swap (claims, config changes…)
    const side = dToken < 0 ? "buy" : "sell";
    trades.push({
      sig: sigs[i].signature,
      time: tx.blockTime ?? sigs[i].blockTime ?? 0,
      slot: tx.slot ?? sigs[i].slot,
      side,
      sol: Math.abs(dSol),
      tokens: Math.abs(dToken),
      priceSol: Math.abs(dSol) / Math.abs(dToken),
      postPriceSol: postPrice(tx, poolBuf),
      trader: tx.transaction.message.accountKeys[0].pubkey.toBase58(),
    });
  });
  // Newest first; within one slot keep the order the chain returned.
  const merged = [...trades, ...entry.trades];
  const seen = new Set<string>();
  entry.trades = merged.filter((t) => (seen.has(t.sig) ? false : (seen.add(t.sig), true))).slice(0, MAX_HISTORY);
  entry.newest = fresh[0].signature;
  entry.at = Date.now();
  return entry.trades;
}

export async function topHolders(mint: string): Promise<Holder[]> {
  const conn = connection();
  const largest = await conn.getTokenLargestAccounts(new PublicKey(mint));
  const accounts = await conn.getMultipleParsedAccounts(largest.value.map((a) => a.address));
  const byOwner = new Map<string, number>();
  accounts.value.forEach((acc, i) => {
    const info = acc && "parsed" in acc.data ? acc.data.parsed?.info : null;
    const owner: string | undefined = info?.owner;
    const tokens = Number(largest.value[i].uiAmount ?? 0);
    if (owner && tokens > 0) byOwner.set(owner, (byOwner.get(owner) ?? 0) + tokens);
  });
  return [...byOwner]
    .map(([owner, tokens]) => ({
      owner,
      tokens,
      pct: (tokens / TOTAL_SUPPLY) * 100,
      label: owner === POOL_AUTHORITY ? "Bonding curve" : undefined,
    }))
    .sort((a, b) => b.tokens - a.tokens);
}


/**
 * Recent trades and top holders for a coin, read straight from the chain
 * (no database needed). Trades come from the pool's own vault balances in
 * each transaction, so amounts are exact: SOL that entered or left the
 * curve, and tokens that left or entered it.
 */
import { Connection, PublicKey, type ParsedTransactionWithMeta, type TokenBalance } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import { deriveDbcPoolAuthority } from "@meteora-ag/dynamic-bonding-curve-sdk";
import { RPC_URL, TOTAL_SUPPLY } from "./config";

export type Trade = {
  sig: string;
  time: number; // unix seconds
  side: "buy" | "sell";
  sol: number;
  tokens: number;
  priceSol: number;
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

const tradeCache = new Map<string, { at: number; trades: Trade[] }>();

export async function recentTrades(pool: string, mint: string, limit = 150): Promise<Trade[]> {
  const hit = tradeCache.get(pool);
  if (hit && Date.now() - hit.at < 5_000) return hit.trades;
  const conn = connection();
  const sigs = (await conn.getSignaturesForAddress(new PublicKey(pool), { limit })).filter((s) => !s.err);
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
      side,
      sol: Math.abs(dSol),
      tokens: Math.abs(dToken),
      priceSol: Math.abs(dSol) / Math.abs(dToken),
      trader: tx.transaction.message.accountKeys[0].pubkey.toBase58(),
    });
  });
  trades.sort((a, b) => b.time - a.time);
  tradeCache.set(pool, { at: Date.now(), trades });
  return trades;
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


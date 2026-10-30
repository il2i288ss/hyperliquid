// Long/short math: a line-by-line port of programs/leverage/src/math.rs so the
// bot-run engine behaves exactly like the audited-shape on-chain version.
// Pure functions, BigInt everywhere, unit-tested in test/ls-math.test.ts.
//
// Units
// - SOL amounts: lamports (bigint)
// - price: lamports per 1 raw token unit, scaled by PRICE_SCALE
// - USD: whole dollars

export const PRICE_SCALE = 1_000_000_000_000n; // 1e12
export const BPS = 10_000n;
export const LAMPORTS = 1_000_000_000n;

export const VAULT_CAP_PER_COIN_BPS = 500n; // 5% of free vault per coin per side
export const DEGEN_TOTAL_VAULT_BPS = 200n; // 2% of free vault for all degen coins
export const LIQ_LOSS_BPS = 9_000n; // liquidate at 90% loss

export type Tier = {
  id: number;
  minMcapUsd: number;
  leverage: number;
  maxMargin: bigint;
  feeBps: bigint; // charged on open AND on close, on position size
  oiCapBps: bigint; // per coin, per side, share of pool SOL
  profitCapX: bigint;
  minHoldSecs: number;
  twapSecs: number;
  minPoolSol: bigint; // degen tier only
  minAgeSecs: number; // degen tier only
};

const sol = (x: number) => BigInt(Math.round(x * 1e9));

/** Same table as the program. `test` = devnet values (short waits, small pools). */
export function tiers(test = false): Tier[] {
  const p = <T>(real: T, t: T) => (test ? t : real);
  const base = { minPoolSol: 0n, minAgeSecs: 0 };
  return [
    { id: 0, minMcapUsd: 0, leverage: 2, maxMargin: sol(0.5), feeBps: 50n, oiCapBps: 500n, profitCapX: 3n, minHoldSecs: p(180, 20), twapSecs: p(180, 10), minPoolSol: p(sol(20), sol(0.5)), minAgeSecs: p(1800, 60) },
    { id: 1, minMcapUsd: 100_000, leverage: 3, maxMargin: sol(4), feeBps: 50n, oiCapBps: 500n, profitCapX: 5n, minHoldSecs: p(60, 20), twapSecs: p(60, 10), ...base },
    { id: 2, minMcapUsd: 500_000, leverage: 5, maxMargin: sol(5), feeBps: 50n, oiCapBps: 500n, profitCapX: 5n, minHoldSecs: p(60, 20), twapSecs: p(60, 10), ...base },
    { id: 3, minMcapUsd: 1_000_000, leverage: 10, maxMargin: sol(5), feeBps: 30n, oiCapBps: 400n, profitCapX: 5n, minHoldSecs: p(60, 20), twapSecs: p(60, 10), ...base },
    { id: 4, minMcapUsd: 5_000_000, leverage: 10, maxMargin: sol(8), feeBps: 30n, oiCapBps: 400n, profitCapX: 5n, minHoldSecs: p(60, 20), twapSecs: p(60, 10), ...base },
    { id: 5, minMcapUsd: 10_000_000, leverage: 10, maxMargin: sol(10), feeBps: 30n, oiCapBps: 400n, profitCapX: 5n, minHoldSecs: p(60, 20), twapSecs: p(60, 10), ...base },
  ];
}

export const tierFor = (all: Tier[], mcapUsd: number) => [...all].reverse().find((t) => mcapUsd >= t.minMcapUsd)!;

/** Market cap in whole USD. */
export function mcapUsd(price: bigint, supplyRaw: bigint, solUsd: number): number {
  const mcapLamports = (price * supplyRaw) / PRICE_SCALE;
  return (Number(mcapLamports) / 1e9) * solUsd;
}

/** Average price a real trade of `size` would get on a constant-product pool. */
export function impactPrice(spot: bigint, size: bigint, poolSol: bigint, buying: boolean): bigint {
  if (poolSol <= 0n) return spot;
  return buying ? (spot * (poolSol + size)) / poolSol : (spot * poolSol) / (poolSol + size);
}

export const entryPrice = (long: boolean, spot: bigint, notional: bigint, poolSol: bigint) =>
  impactPrice(spot, notional, poolSol, long);

export function exitPrice(long: boolean, spot: bigint, entry: bigint, notional: bigint, poolSol: bigint) {
  const value = (notional * spot) / entry;
  return impactPrice(spot, value, poolSol, !long);
}

/** Raw profit or loss in lamports (before fees and caps). */
export function pnl(long: boolean, notional: bigint, entry: bigint, exit: bigint): bigint {
  return long ? (notional * (exit - entry)) / entry : (notional * (entry - exit)) / entry;
}

export const fee = (notional: bigint, feeBps: bigint) => (notional * feeBps) / BPS;

/** What the trader receives: margin + capped PnL - close fee, never below 0. */
export function settle(margin: bigint, rawPnl: bigint, profitCapX: bigint, closeFee: bigint): bigint {
  const cap = margin * profitCapX;
  const capped = rawPnl < cap ? rawPnl : cap;
  const out = margin + capped - closeFee;
  return out > 0n ? out : 0n;
}

export const isLiquidatable = (margin: bigint, rawPnl: bigint) => rawPnl <= -((margin * LIQ_LOSS_BPS) / BPS);

export type Trigger = "none" | "sl" | "tp";
/** Long: TP at/above, SL at/below. Short: the reverse. 0 = not set. */
export function triggerHit(long: boolean, mcap: number, sl: number, tp: number): Trigger {
  const tpHit = long ? tp > 0 && mcap >= tp : tp > 0 && mcap <= tp;
  const slHit = long ? sl > 0 && mcap <= sl : sl > 0 && mcap >= sl;
  return slHit ? "sl" : tpHit ? "tp" : "none";
}

/** Per coin, per side: the smaller of the pool cap and the vault cap. */
export function coinOiCap(t: Tier, poolSol: bigint, vaultFree: bigint): bigint {
  const poolCap = (poolSol * t.oiCapBps) / BPS;
  const vaultCap = (vaultFree * VAULT_CAP_PER_COIN_BPS) / BPS;
  return poolCap < vaultCap ? poolCap : vaultCap;
}
export const degenTotalCap = (vaultFree: bigint) => (vaultFree * DEGEN_TOTAL_VAULT_BPS) / BPS;

/** Time-weighted average over the last `window` s; null if under half covered. */
export function twap(obs: { ts: number; price: bigint }[], now: number, window: number): bigint | null {
  const v = obs.filter((o) => o.ts > 0).sort((a, b) => a.ts - b.ts);
  const start = now - window;
  let acc = 0n;
  let total = 0;
  for (let i = 0; i < v.length; i++) {
    const segStart = Math.max(v[i].ts, start);
    const segEnd = Math.min(i + 1 < v.length ? v[i + 1].ts : now, now);
    if (segEnd > segStart) {
      acc += v[i].price * BigInt(segEnd - segStart);
      total += segEnd - segStart;
    }
  }
  if (total * 2 < window) return null;
  return acc / BigInt(total);
}

/** Meteora Q64.64 sqrt price -> scaled price. */
export function priceFromSqrtQ64(sqrt: bigint): bigint {
  const a = sqrt >> 32n;
  const sq = a * a;
  return ((sq >> 64n) * PRICE_SCALE) + (((sq & ((1n << 64n) - 1n)) * PRICE_SCALE) >> 64n);
}

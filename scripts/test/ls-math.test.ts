import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LAMPORTS,
  PRICE_SCALE,
  coinOiCap,
  entryPrice,
  exitPrice,
  fee,
  isLiquidatable,
  mcapUsd,
  pnl,
  priceFromSqrtQ64,
  settle,
  tierFor,
  tiers,
  triggerHit,
  twap,
} from "../src/ls/math.ts";

const T = tiers();
const sol = (x: number) => BigInt(Math.round(x * 1e9));

test("tiers match the agreed table", () => {
  assert.deepEqual(T.map((t) => [t.leverage, Number(t.maxMargin) / 1e9]), [[2, 0.5], [3, 4], [5, 5], [10, 5], [10, 8], [10, 10]]);
  assert.equal(tierFor(T, 99_999).id, 0);
  assert.equal(tierFor(T, 100_000).id, 1);
  assert.equal(tierFor(T, 2_000_000).id, 3);
  assert.equal(tierFor(T, 50_000_000).id, 5);
  assert.equal(T[0].minPoolSol, 0n); // no wait on coins under $100K
  assert.equal(T[0].minAgeSecs, 0);
});

test("sqrt price and market cap", () => {
  // sqrt = 2^64 -> price 1.0 (scaled)
  assert.equal(priceFromSqrtQ64(1n << 64n), PRICE_SCALE);
  // 30 SOL market cap on 1B tokens with 6 decimals: price = 30e9 lamports / 1e15 raw
  const price = (30n * LAMPORTS * PRICE_SCALE) / 1_000_000_000_000_000n;
  assert.equal(Math.round(mcapUsd(price, 1_000_000_000_000_000n, 150)), 4500);
});

test("long and short pnl", () => {
  const P = PRICE_SCALE;
  assert.equal(pnl(true, sol(3), P, (P * 12n) / 10n), sol(0.6));
  assert.equal(pnl(false, sol(3), P, (P * 8n) / 10n), sol(0.6));
  assert.equal(pnl(true, sol(3), P, (P * 8n) / 10n), -sol(0.6));
});

test("virtual price impact makes entry worse for both sides", () => {
  const P = PRICE_SCALE;
  assert.ok(entryPrice(true, P, sol(5), sol(100)) > P);
  assert.ok(entryPrice(false, P, sol(5), sol(100)) < P);
  // exit of a long sells: below spot
  assert.ok(exitPrice(true, P, P, sol(5), sol(100)) < P);
});

test("profit cap, close fee and floor at zero", () => {
  assert.equal(settle(sol(1), sol(10), 5n, 0n), sol(6)); // capped at 5x margin profit
  assert.equal(settle(sol(1), -sol(2), 5n, 0n), 0n); // never negative
  assert.equal(settle(sol(1), sol(0.5), 5n, fee(sol(3), 50n)), sol(1.5) - sol(0.015));
});

test("liquidation at 90% loss", () => {
  assert.equal(isLiquidatable(sol(1), -sol(0.89)), false);
  assert.equal(isLiquidatable(sol(1), -sol(0.9)), true);
});

test("caps pick the smaller of pool and vault", () => {
  assert.equal(coinOiCap(T[1], sol(100), sol(1000)), sol(5)); // 5% of pool
  assert.equal(coinOiCap(T[1], sol(1000), sol(20)), sol(1)); // 5% of vault
  assert.equal(coinOiCap(T[3], sol(100), sol(1000)), sol(4)); // 4% on 10x tiers
});

test("TWAP resists a last-second pump", () => {
  const obs = [0, 10, 20, 30, 40, 50].map((ts) => ({ ts: 1000 + ts, price: 100n }));
  obs.push({ ts: 1058, price: 1000n }); // pump 2 s before now
  const avg = twap(obs, 1060, 60)!;
  assert.ok(avg < 140n, `avg ${avg}`);
  assert.equal(twap([{ ts: 1059, price: 1n }], 1060, 60), null); // not enough history
});

test("take profit / stop loss by market cap", () => {
  assert.equal(triggerHit(true, 200_000, 150_000, 300_000), "none");
  assert.equal(triggerHit(true, 300_000, 150_000, 300_000), "tp");
  assert.equal(triggerHit(true, 149_000, 150_000, 300_000), "sl");
  assert.equal(triggerHit(false, 119_000, 260_000, 120_000), "tp");
  assert.equal(triggerHit(false, 270_000, 260_000, 120_000), "sl");
  assert.equal(triggerHit(true, 1e12, 0, 0), "none");
});

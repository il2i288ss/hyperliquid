import { test } from "node:test";
import assert from "node:assert/strict";
import { splitLamports, POOL_FEE_BPS, METEORA_PROTOCOL_SHARE } from "../src/platform.ts";

test("100 SOL of fees splits 33.3 / 3.3 / 63.3", () => {
  const p = splitLamports(100_000_000_000n);
  assert.equal(p.holders, 33_333_333_333n);
  assert.equal(p.treasury, 3_333_333_333n);
  assert.equal(p.vault, 63_333_333_334n); // dust goes to vault
  assert.equal(p.holders + p.treasury + p.vault + p.creator, 100_000_000_000n);
});

test("nothing is lost on odd amounts", () => {
  for (const t of [1n, 7n, 299n, 12_345_678_901n]) {
    const p = splitLamports(t);
    assert.equal(p.holders + p.treasury + p.vault + p.creator, t);
  }
});

test("pool fee nets 3% after Meteora", () => {
  assert.equal(POOL_FEE_BPS * (1 - METEORA_PROTOCOL_SHARE), 300);
});

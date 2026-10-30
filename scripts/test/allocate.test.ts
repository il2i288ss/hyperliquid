import { test } from "node:test";
import assert from "node:assert/strict";
import { allocate, averageBalances } from "../src/rewards/allocate.ts";

test("pro-rata split", () => {
  const bal = new Map([["a", 600n], ["b", 300n], ["c", 100n]]);
  const { payouts, allocated } = allocate(1_000_000n, bal, new Map(), 1n);
  assert.equal(payouts.get("a"), 600_000n);
  assert.equal(payouts.get("b"), 300_000n);
  assert.equal(payouts.get("c"), 100_000n);
  assert.equal(allocated, 1_000_000n);
});

test("dust is carried, then paid when it adds up", () => {
  const bal = new Map([["whale", 9_990n], ["tiny", 10n]]);
  let r = allocate(1_000_000n, bal, new Map(), 5_000n);
  assert.equal(r.payouts.has("tiny"), false);
  assert.equal(r.carry.get("tiny"), 1_000n);
  for (let i = 0; i < 4; i++) r = allocate(1_000_000n, bal, r.carry, 5_000n);
  assert.equal(r.payouts.get("tiny"), 5_000n);
  assert.equal(r.carry.has("tiny"), false);
});

test("buying right before one snapshot earns little", () => {
  const snaps = [
    new Map([["holder", 1000n]]),
    new Map([["holder", 1000n]]),
    new Map([["holder", 1000n]]),
    new Map([["holder", 1000n], ["flipper", 1000n]]),
  ];
  const avg = averageBalances(snaps);
  assert.equal(avg.get("holder"), 1000n);
  assert.equal(avg.get("flipper"), 250n);
});

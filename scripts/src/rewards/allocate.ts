// Pure reward math, no Solana imports, so it is unit-tested directly.

export type Balances = Map<string, bigint>;

/**
 * Time-weighted balance: average of each wallet's balance across all
 * snapshots in the period. A wallet missing from a snapshot held 0 then,
 * so buying right before one snapshot earns little.
 */
export function averageBalances(snapshots: Balances[]): Balances {
  const out: Balances = new Map();
  if (snapshots.length === 0) return out;
  for (const snap of snapshots) {
    for (const [w, b] of snap) out.set(w, (out.get(w) ?? 0n) + b);
  }
  const n = BigInt(snapshots.length);
  for (const [w, b] of out) out.set(w, b / n);
  return out;
}

/**
 * Split `pot` lamports pro-rata by balance. Amounts below `minPayout` are
 * carried into `carry` and paid once they add up, so tiny holders aren't
 * lost and we don't waste tx fees on dust.
 */
export function allocate(
  pot: bigint,
  balances: Balances,
  carry: Map<string, bigint>,
  minPayout: bigint,
): { payouts: Map<string, bigint>; carry: Map<string, bigint>; allocated: bigint } {
  let total = 0n;
  for (const b of balances.values()) total += b;
  const payouts = new Map<string, bigint>();
  const nextCarry = new Map(carry);
  let allocated = 0n;
  if (total === 0n || pot === 0n) return { payouts, carry: nextCarry, allocated };

  for (const [w, b] of balances) {
    const share = (pot * b) / total;
    allocated += share;
    const due = share + (nextCarry.get(w) ?? 0n);
    if (due >= minPayout) {
      payouts.set(w, due);
      nextCarry.delete(w);
    } else if (due > 0n) {
      nextCarry.set(w, due);
    }
  }
  return { payouts, carry: nextCarry, allocated };
}

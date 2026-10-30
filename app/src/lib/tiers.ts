// Mirror of TIERS in programs/leverage/src/math.rs — keep both in sync.
export type Tier = {
  id: number;
  label: string;
  minMcapUsd: number;
  leverage: number;
  maxMarginSol: number;
  feePct: number;
};

export const TIERS: Tier[] = [
  { id: 0, label: "Degen (under $100K)", minMcapUsd: 0, leverage: 2, maxMarginSol: 0.5, feePct: 0.5 },
  { id: 1, label: "$100K–$500K", minMcapUsd: 100_000, leverage: 3, maxMarginSol: 4, feePct: 0.5 },
  { id: 2, label: "$500K–$1M", minMcapUsd: 500_000, leverage: 5, maxMarginSol: 5, feePct: 0.5 },
  { id: 3, label: "$1M–$5M", minMcapUsd: 1_000_000, leverage: 10, maxMarginSol: 5, feePct: 0.3 },
  { id: 4, label: "$5M–$10M", minMcapUsd: 5_000_000, leverage: 10, maxMarginSol: 8, feePct: 0.3 },
  { id: 5, label: "$10M+", minMcapUsd: 10_000_000, leverage: 10, maxMarginSol: 10, feePct: 0.3 },
];

export const tierFor = (mcapUsd: number) =>
  [...TIERS].reverse().find((t) => mcapUsd >= t.minMcapUsd)!;

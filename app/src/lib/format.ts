export const usd = (v: number) => {
  if (!Number.isFinite(v)) return "—";
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
};

/** Tiny token prices: $0.0₅312 style is hard to read, so use significant digits. */
export const price = (v: number) => {
  if (!Number.isFinite(v) || v <= 0) return "—";
  if (v >= 1) return `$${v.toFixed(4)}`;
  return `$${v.toPrecision(3)}`;
};

export const sol = (v: number, digits = 3) => `${Number.isFinite(v) ? v.toFixed(digits) : "—"} SOL`;

export const age = (seconds: number) => {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
};

export const short = (addr: string) => `${addr.slice(0, 4)}…${addr.slice(-4)}`;

const TINTS = [
  ["#2a2f5a", "#b7c7ff"],
  ["#3a2a16", "#f5c77a"],
  ["#123128", "#7fe0b8"],
  ["#3a1a22", "#f49aa6"],
  ["#22283a", "#afc2e0"],
];
/** Stable avatar colors per coin. */
export const tint = (key: string) => {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const [bg, fg] = TINTS[h % TINTS.length];
  return { background: bg, color: fg };
};

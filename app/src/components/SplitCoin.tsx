/** Obverse's mark for the two sides of a coin: a circle, half filled. Left half = long, right half = short. */
export function SplitCoin({ size = 14, side = "short" }: { size?: number; side?: "long" | "short" }) {
  return (
    <svg className="split-coin" width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d={side === "long" ? "M8 1.5a6.5 6.5 0 0 0 0 13z" : "M8 1.5a6.5 6.5 0 0 1 0 13z"} fill="currentColor" />
    </svg>
  );
}

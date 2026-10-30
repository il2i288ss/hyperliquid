/** Byte offsets in Meteora's VirtualPool account (raw account data). */
export const POOL_SQRT_PRICE_OFFSET = 280;
export const POOL_QUOTE_RESERVE_OFFSET = 240;

const u64 = (b: Uint8Array, o: number) => {
  let v = 0n;
  for (let i = 7; i >= 0; i--) v = (v << 8n) | BigInt(b[o + i]);
  return v;
};

/** Price (SOL per token) and SOL in the curve, decoded straight from the pool account bytes. */
export function decodePoolLive(data: Uint8Array) {
  const sqrt = u64(data, POOL_SQRT_PRICE_OFFSET) + (u64(data, POOL_SQRT_PRICE_OFFSET + 8) << 64n);
  const s = Number(sqrt) / 2 ** 64;
  return { priceSol: (s * s) / 1e3, quoteSol: Number(u64(data, POOL_QUOTE_RESERVE_OFFSET)) / 1e9 };
}

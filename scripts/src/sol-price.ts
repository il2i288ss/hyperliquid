/** Current SOL/USD from two public sources (median-of-what-answered). */
export async function solUsdNow(): Promise<number> {
  const sources: [string, (j: any) => number][] = [
    ["https://api.coinbase.com/v2/prices/SOL-USD/spot", (j) => Number(j.data.amount)],
    ["https://api.kraken.com/0/public/Ticker?pair=SOLUSD", (j) => Number((Object.values(j.result)[0] as { c: string[] }).c[0])],
    ["https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT", (j) => Number(j.price)],
  ];
  const prices = (
    await Promise.all(
      sources.map(async ([url, pick]) => {
        try {
          const r = await fetch(url, { signal: AbortSignal.timeout(8_000) });
          const p = pick(await r.json());
          return p > 1 && p < 100_000 ? p : null;
        } catch {
          return null;
        }
      }),
    )
  ).filter((p): p is number => p !== null).sort((a, b) => a - b);
  if (!prices.length) throw new Error("Could not fetch the SOL price");
  return prices[Math.floor(prices.length / 2)];
}

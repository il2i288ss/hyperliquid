"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createChart, ColorType, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import type { Trade } from "@/lib/activity";

const FRAMES = [
  { label: "1m", s: 60 },
  { label: "5m", s: 300 },
  { label: "15m", s: 900 },
  { label: "1h", s: 3600 },
];

/** Candles built from the coin's real trades. */
export function PriceChart({ trades, solUsd }: { trades: Trade[]; solUsd: number }) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [frame, setFrame] = useState(60);

  const candles = useMemo(() => {
    const byBucket = new Map<number, { open: number; high: number; low: number; close: number }>();
    [...trades].sort((a, b) => a.time - b.time).forEach((t) => {
      const p = t.priceSol * solUsd;
      const b = Math.floor(t.time / frame) * frame;
      const c = byBucket.get(b);
      if (!c) byBucket.set(b, { open: p, high: p, low: p, close: p });
      else Object.assign(c, { high: Math.max(c.high, p), low: Math.min(c.low, p), close: p });
    });
    // Each candle opens where the previous one closed, so the chart has no gaps.
    let prev: number | null = null;
    return [...byBucket].map(([time, c]) => {
      const open = prev ?? c.open;
      prev = c.close;
      return { time: time as UTCTimestamp, open, high: Math.max(c.high, open), low: Math.min(c.low, open), close: c.close };
    });
  }, [trades, solUsd, frame]);

  useEffect(() => {
    if (!el.current) return;
    const c = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#8b95a3", fontFamily: "var(--font-mono), monospace" },
      grid: { vertLines: { color: "#1a1f27" }, horzLines: { color: "#1a1f27" } },
      rightPriceScale: { borderColor: "#20252e" },
      timeScale: { borderColor: "#20252e", timeVisible: true, secondsVisible: false },
      crosshair: { mode: 1 },
    });
    series.current = c.addCandlestickSeries({
      upColor: "#34d399", downColor: "#f0566a", wickUpColor: "#34d399", wickDownColor: "#f0566a", borderVisible: false,
      priceFormat: { type: "price", precision: 8, minMove: 0.00000001 },
    });
    chart.current = c;
    return () => c.remove();
  }, []);

  useEffect(() => {
    series.current?.setData(candles);
    chart.current?.timeScale().fitContent();
  }, [candles]);

  return (
    <section className="panel" aria-label="Price chart">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderBottom: "1px solid var(--line)" }}>
        <div style={{ display: "flex", gap: 2 }} role="group" aria-label="Timeframe">
          {FRAMES.map((f) => (
            <button key={f.s} type="button" className={`subtab${frame === f.s ? " on" : ""}`} aria-pressed={frame === f.s} onClick={() => setFrame(f.s)}>{f.label}</button>
          ))}
        </div>
        <span className="muted" style={{ fontSize: 12 }}>Price (USD) · {trades.length} recent trades</span>
      </div>
      <div style={{ position: "relative", height: 360 }}>
        <div ref={el} style={{ position: "absolute", inset: 0 }} />
        {candles.length === 0 && (
          <div className="empty" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>No trades yet.</div>
        )}
      </div>
    </section>
  );
}

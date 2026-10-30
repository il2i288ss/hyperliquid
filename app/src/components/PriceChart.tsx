"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createChart, ColorType, CrosshairMode, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import type { Trade } from "@/lib/activity";
import type { Coin } from "@/lib/coins";
import { BRAND, TOTAL_SUPPLY } from "@/lib/config";
import { price as fmtPrice, usd } from "@/lib/format";

const FRAMES = [
  { label: "1s", s: 1 },
  { label: "15s", s: 15 },
  { label: "1m", s: 60 },
  { label: "5m", s: 300 },
  { label: "15m", s: 900 },
  { label: "1h", s: 3600 },
];
/** Every coin starts on the curve at this market cap (create-partner-config). */
const LAUNCH_MCAP_SOL = 30;

type Mode = "mcap" | "price";

/**
 * Candles from the coin's real trades, in market cap (default) or price.
 * Starts at the launch price, ends at the live price, and keeps your zoom
 * while new trades stream in.
 */
export function PriceChart({ trades, solUsd, coin }: { trades: Trade[]; solUsd: number; coin: Coin }) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const fitted = useRef("");
  const [frame, setFrame] = useState(60);
  const [mode, setMode] = useState<Mode>("mcap");

  const scale = mode === "mcap" ? TOTAL_SUPPLY * solUsd : solUsd;

  const candles = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    const launchedAt = Math.floor(now - coin.ageSeconds);
    const points: { t: number; p: number }[] = [{ t: launchedAt, p: LAUNCH_MCAP_SOL / TOTAL_SUPPLY }];
    [...trades].sort((a, b) => a.time - b.time).forEach((t) => points.push({ t: Math.max(t.time, launchedAt), p: t.priceSol }));
    if (coin.priceSol > 0) points.push({ t: now, p: coin.priceSol }); // live price

    const byBucket = new Map<number, { open: number; high: number; low: number; close: number }>();
    for (const { t, p: raw } of points) {
      const p = raw * scale;
      const b = Math.floor(t / frame) * frame;
      const c = byBucket.get(b);
      if (!c) byBucket.set(b, { open: p, high: p, low: p, close: p });
      else Object.assign(c, { high: Math.max(c.high, p), low: Math.min(c.low, p), close: p });
    }
    // Each candle opens where the previous one closed, so there are no gaps.
    let prev: number | null = null;
    return [...byBucket].sort((a, b) => a[0] - b[0]).map(([time, c]) => {
      const open = prev ?? c.open;
      prev = c.close;
      return { time: time as UTCTimestamp, open, high: Math.max(c.high, open), low: Math.min(c.low, open), close: c.close };
    });
  }, [trades, scale, frame, coin.ageSeconds, coin.priceSol]);

  useEffect(() => {
    if (!el.current) return;
    const font = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
    const c = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#8a8a8a", fontFamily: font, fontSize: 11 },
      grid: { vertLines: { color: "#141414" }, horzLines: { color: "#141414" } },
      rightPriceScale: { borderColor: "#262626", scaleMargins: { top: 0.15, bottom: 0.1 } },
      timeScale: { borderColor: "#262626", timeVisible: true, secondsVisible: true, rightOffset: 6, barSpacing: 10 },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#525252", labelBackgroundColor: "#262626" },
        horzLine: { color: "#525252", labelBackgroundColor: "#262626" },
      },
      // Brand watermark: light weight, very faint
      watermark: { visible: true, text: BRAND.toLowerCase(), fontSize: 72, fontFamily: font, fontStyle: "300", color: "rgba(250, 250, 250, 0.045)", horzAlign: "center", vertAlign: "center" },
    });
    series.current = c.addCandlestickSeries({
      upColor: "#fafafa", downColor: "#0a0a0a", wickUpColor: "#d4d4d4", wickDownColor: "#737373",
      borderVisible: true, borderUpColor: "#fafafa", borderDownColor: "#737373",
      priceLineColor: "#525252",
    });
    chart.current = c;
    return () => c.remove();
  }, []);

  // Axis labels: $2.85K style for market cap, significant digits for price.
  useEffect(() => {
    chart.current?.applyOptions({ localization: { priceFormatter: mode === "mcap" ? usd : fmtPrice } });
    series.current?.applyOptions({ priceFormat: { type: "custom", minMove: 1e-12, formatter: mode === "mcap" ? usd : fmtPrice } });
  }, [mode]);

  useEffect(() => {
    series.current?.setData(candles);
    // Fit once per coin/timeframe/mode; afterwards keep the user's zoom.
    const key = `${frame}:${mode}`;
    if (candles.length && fitted.current !== key) {
      chart.current?.timeScale().fitContent();
      fitted.current = key;
    }
  }, [candles, frame, mode]);

  return (
    <section className="panel" aria-label="Chart">
      <div className="chart-bar">
        <div className="seg" role="group" aria-label="Timeframe">
          {FRAMES.map((f) => (
            <button key={f.s} type="button" className={frame === f.s ? "on" : ""} aria-pressed={frame === f.s} onClick={() => setFrame(f.s)}>{f.label}</button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Chart value">
          <button type="button" className={mode === "mcap" ? "on" : ""} aria-pressed={mode === "mcap"} onClick={() => setMode("mcap")}>Market cap</button>
          <button type="button" className={mode === "price" ? "on" : ""} aria-pressed={mode === "price"} onClick={() => setMode("price")}>Price</button>
        </div>
      </div>
      <div style={{ position: "relative", height: 400 }}>
        <div ref={el} style={{ position: "absolute", inset: 0 }} />
      </div>
    </section>
  );
}

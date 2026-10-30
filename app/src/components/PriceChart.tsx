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
  const line = useRef<ISeriesApi<"Area"> | null>(null);
  const [style, setStyle] = useState<"line" | "candles">("line");
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
      grid: { vertLines: { color: "#17161f" }, horzLines: { color: "#17161f" } },
      rightPriceScale: { borderColor: "#201f2b", scaleMargins: { top: 0.15, bottom: 0.1 } },
      timeScale: { borderColor: "#201f2b", timeVisible: true, secondsVisible: true, rightOffset: 6, barSpacing: 10 },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#525252", labelBackgroundColor: "#201f2b" },
        horzLine: { color: "#525252", labelBackgroundColor: "#201f2b" },
      },
      // Brand watermark: light weight, very faint
      watermark: { visible: true, text: BRAND.toLowerCase(), fontSize: 72, fontFamily: font, fontStyle: "300", color: "rgba(250, 250, 250, 0.045)", horzAlign: "center", vertAlign: "center" },
    });
    series.current = c.addCandlestickSeries({
      upColor: "#2ebd85", downColor: "#f6465d", wickUpColor: "#2ebd85", wickDownColor: "#f6465d",
      borderVisible: false,
      priceLineColor: "#525252",
      visible: false,
    });
    line.current = c.addAreaSeries({
      lineWidth: 2,
      lineColor: "#2ebd85",
      topColor: "rgba(46, 189, 133, 0.28)",
      bottomColor: "rgba(46, 189, 133, 0)",
      priceLineColor: "#525252",
      crosshairMarkerRadius: 4,
    });
    chart.current = c;
    return () => c.remove();
  }, []);

  // Axis labels: $2.85K style for market cap, significant digits for price.
  useEffect(() => {
    chart.current?.applyOptions({ localization: { priceFormatter: mode === "mcap" ? usd : fmtPrice } });
    const priceFormat = { type: "custom" as const, minMove: 1e-12, formatter: mode === "mcap" ? usd : fmtPrice };
    series.current?.applyOptions({ priceFormat });
    line.current?.applyOptions({ priceFormat });
  }, [mode]);

  // Graph (default) or candles; the graph is green when up since launch, red when down.
  useEffect(() => {
    series.current?.applyOptions({ visible: style === "candles" });
    line.current?.applyOptions({ visible: style === "line" });
  }, [style]);

  useEffect(() => {
    series.current?.setData(candles);
    line.current?.setData(candles.map((c) => ({ time: c.time, value: c.close })));
    const up = candles.length < 2 || candles[candles.length - 1].close >= candles[0].open;
    const [r, g, b] = up ? [46, 189, 133] : [246, 70, 93];
    line.current?.applyOptions({ lineColor: `rgb(${r}, ${g}, ${b})`, topColor: `rgba(${r}, ${g}, ${b}, 0.28)`, bottomColor: `rgba(${r}, ${g}, ${b}, 0)` });
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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <div className="seg" role="group" aria-label="Chart style">
          <button type="button" className={style === "line" ? "on" : ""} aria-pressed={style === "line"} onClick={() => setStyle("line")}>Graph</button>
          <button type="button" className={style === "candles" ? "on" : ""} aria-pressed={style === "candles"} onClick={() => setStyle("candles")}>Candles</button>
        </div>
        <div className="seg" role="group" aria-label="Chart value">
          <button type="button" className={mode === "mcap" ? "on" : ""} aria-pressed={mode === "mcap"} onClick={() => setMode("mcap")}>Market cap</button>
          <button type="button" className={mode === "price" ? "on" : ""} aria-pressed={mode === "price"} onClick={() => setMode("price")}>Price</button>
        </div>
        </div>
      </div>
      <div style={{ position: "relative", height: 400 }}>
        <div ref={el} style={{ position: "absolute", inset: 0 }} />
      </div>
    </section>
  );
}

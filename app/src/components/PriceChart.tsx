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
/** Trading fee taken from each swap (pool fee), removed from fill prices. */
const FEE = 0.0375;

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
  const [tfOpen, setTfOpen] = useState(false);
  const tfBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!tfOpen) return;
    const close = (e: MouseEvent) => !tfBox.current?.contains(e.target as Node) && setTfOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setTfOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [tfOpen]);

  const scale = mode === "mcap" ? TOTAL_SUPPLY * solUsd : solUsd;

  const candles = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    const launchedAt = Math.floor(now - coin.ageSeconds);
    // Each trade's real before/after price. On a constant-product curve the
    // average fill price is the geometric mean of the two, so walking back
    // from today's live price recovers every step exactly (fees removed).
    const steps: { t: number; pre: number; post: number }[] = [];
    let p = coin.priceSol > 0 ? coin.priceSol : LAUNCH_MCAP_SOL / TOTAL_SUPPLY;
    for (const tr of [...trades].sort((a, b) => b.time - a.time)) {
      if (!(tr.sol > 0 && tr.tokens > 0)) continue;
      const fill = tr.side === "buy" ? (tr.sol * (1 - FEE)) / tr.tokens : tr.sol / (1 - FEE) / tr.tokens;
      let pre = (fill * fill) / p;
      if (!(pre > 0) || pre / p > 20 || p / pre > 20) pre = p; // ignore broken data
      steps.push({ t: Math.max(tr.time, launchedAt), pre, post: p });
      p = pre;
    }
    steps.reverse();

    type C = { open: number; high: number; low: number; close: number };
    const byBucket = new Map<number, C>();
    const add = (t: number, a: number, b: number) => {
      const k = Math.floor(t / frame) * frame;
      const c = byBucket.get(k);
      const [x, y] = [a * scale, b * scale];
      if (!c) byBucket.set(k, { open: x, high: Math.max(x, y), low: Math.min(x, y), close: y });
      else Object.assign(c, { high: Math.max(c.high, x, y), low: Math.min(c.low, x, y), close: y });
    };
    add(launchedAt, p, p); // launch price
    for (const st of steps) add(st.t, st.pre, st.post);
    add(now, coin.priceSol || p, coin.priceSol || p); // live candle

    // Each candle opens where the previous one closed: no gaps, no jumps.
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
      timeScale: { borderColor: "#201f2b", timeVisible: true, secondsVisible: true, rightOffset: 8, barSpacing: 9, minBarSpacing: 3, lockVisibleTimeRangeOnResize: true },
      handleScale: { axisPressedMouseMove: { time: true, price: true } },
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
      borderVisible: true, borderUpColor: "#2ebd85", borderDownColor: "#f6465d",
      priceLineColor: "#4a4866",
      priceLineStyle: 2,
    });
    chart.current = c;
    return () => c.remove();
  }, []);

  // Axis labels: $2.85K style for market cap, significant digits for price.
  useEffect(() => {
    chart.current?.applyOptions({ localization: { priceFormatter: mode === "mcap" ? usd : fmtPrice } });
    const priceFormat = { type: "custom" as const, minMove: 1e-12, formatter: mode === "mcap" ? usd : fmtPrice };
    series.current?.applyOptions({ priceFormat });
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
        <div className="tf" ref={tfBox}>
          <button type="button" className="tf-btn" aria-haspopup="listbox" aria-expanded={tfOpen} onClick={() => setTfOpen((o) => !o)}>
            {FRAMES.find((f) => f.s === frame)?.label}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: tfOpen ? "rotate(180deg)" : undefined, transition: "transform .15s" }}><path d="m6 9 6 6 6-6" /></svg>
          </button>
          {tfOpen && (
            <div className="tf-menu" role="listbox" aria-label="Timeframe">
              {FRAMES.map((f) => (
                <button key={f.s} type="button" role="option" aria-selected={frame === f.s} className={frame === f.s ? "on" : ""} onClick={() => { setFrame(f.s); setTfOpen(false); }}>{f.label}</button>
              ))}
            </div>
          )}
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

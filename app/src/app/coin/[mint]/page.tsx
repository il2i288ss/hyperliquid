"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CoinAvatar } from "@/components/CoinAvatar";
import { SpotPanel } from "@/components/SpotPanel";
import { LeveragePanel } from "@/components/LeveragePanel";
import { PositionsTable } from "@/components/PositionsTable";
import { PriceChart } from "@/components/PriceChart";
import { HoldersTable, TradesTable } from "@/components/ActivityTables";
import type { Holder, Trade } from "@/lib/activity";
import { useLeverage } from "@/lib/useLeverage";
import { LEVERAGE_ENABLED, explorer } from "@/lib/config";
import { age, price, short, usd } from "@/lib/format";
import { tierFor } from "@/lib/tiers";
import type { Coin } from "@/lib/coins";

type Mode = "buy" | "sell" | "lev";

export default function CoinPage() {
  const { mint } = useParams<{ mint: string }>();
  const [coin, setCoin] = useState<Coin | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<Mode>("buy");
  const [tab, setTab] = useState<"positions" | "trades" | "holders">(LEVERAGE_ENABLED ? "positions" : "trades");
  const lev = useLeverage(mint);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [holders, setHolders] = useState<Holder[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/coins/${mint}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not load this coin");
      setCoin(body.coin);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [mint]);

  const loadActivity = useCallback(async () => {
    const [t, h] = await Promise.all([
      fetch(`/api/coins/${mint}/trades`).then((r) => (r.ok ? r.json() : { trades: [] })),
      fetch(`/api/coins/${mint}/holders`).then((r) => (r.ok ? r.json() : { holders: [] })),
    ]);
    setTrades(t.trades ?? []);
    setHolders(h.holders ?? []);
  }, [mint]);

  useEffect(() => {
    load();
    loadActivity().catch(() => {});
    const t = setInterval(() => {
      load();
      loadActivity().catch(() => {});
    }, 8_000);
    return () => clearInterval(t);
  }, [load, loadActivity]);

  const refreshAll = () => {
    load();
    loadActivity().catch(() => {});
    lev.refresh().catch(() => {});
  };

  if (error && !coin) return <main className="page"><p className="msg-err" role="alert">{error}</p></main>;
  if (!coin) return <main className="page"><p className="muted">Loading…</p></main>;

  const tier = tierFor(coin.mcapUsd);
  const solUsd = lev.global?.solUsd || coin.priceUsd / coin.priceSol || 0;

  return (
    <>
      <section className="strip">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <CoinAvatar mint={coin.mint} name={coin.name} large />
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{coin.name}</h1>
              <span className="muted">${coin.symbol}</span>
              {coin.leverage && <span className="badge">Long/Short · up to {tier.leverage}x</span>}
              {coin.graduated && <span className="badge grad">Graduated</span>}
            </div>
            <div className="muted" style={{ fontSize: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a href={explorer("address", coin.mint)} target="_blank" rel="noreferrer" className="mono">{short(coin.mint)}</a>
              <span>{age(coin.ageSeconds)} old</span>
              <span>by <span className="mono">{short(coin.creator)}</span></span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 28px", flex: "1 1 520px" }}>
          <div className="stat"><span>Price</span><span>{price(coin.priceUsd)}</span></div>
          <div className="stat"><span>Market cap</span><span>{usd(coin.mcapUsd)}</span></div>
          <div className="stat"><span>Pool liquidity</span><span>{coin.quoteReserveSol.toFixed(2)} SOL</span></div>
          {!coin.graduated && <div className="stat"><span>Bonding curve</span><span>{Math.round(coin.curveProgress * 100)}%</span></div>}
          {coin.leverage && <div className="stat"><span>Long / short open</span><span>{(lev.market?.oiLong ?? 0).toFixed(2)} / {(lev.market?.oiShort ?? 0).toFixed(2)} SOL</span></div>}
        </div>
      </section>

      <main className="page">
        <div className="split">
          <div className="main">
            <PriceChart trades={trades} solUsd={solUsd} />

            <section className="panel">
              <div className="subtabs" role="tablist" aria-label="Activity">
                {([["positions", `Your positions (${lev.positions.length})`], ["trades", "Trades"], ["holders", "Holders"]] as const).filter(([k]) => LEVERAGE_ENABLED || k !== "positions").map(([k, label]) => (
                  <button key={k} type="button" role="tab" aria-selected={tab === k} className={`subtab${tab === k ? " on" : ""}`} onClick={() => setTab(k)}>{label}</button>
                ))}
              </div>
              {tab === "positions" ? (
                <PositionsTable coin={coin} positions={lev.positions} solUsd={solUsd} testBuild={lev.global?.testBuild ?? false} onDone={refreshAll} />
              ) : tab === "trades" ? (
                <TradesTable trades={trades} solUsd={solUsd} symbol={coin.symbol} />
              ) : (
                <HoldersTable holders={holders} />
              )}
            </section>
          </div>

          <aside className="side">
            <section className="panel pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="tabs" role="tablist" aria-label="Order type">
                {([["buy", "Buy"], ["sell", "Sell"], ["lev", "Long / Short"]] as const).map(([k, label]) => (
                  <button key={k} type="button" role="tab" aria-selected={mode === k} className={`tab${mode === k ? " on" : ""}`} onClick={() => setMode(k)}>{label}</button>
                ))}
              </div>
              {mode === "lev"
                ? LEVERAGE_ENABLED
                  ? <LeveragePanel coin={coin} lev={lev} onDone={refreshAll} />
                  : <p className="note" style={{ fontSize: 13 }}><b style={{ color: "var(--text)" }}>Long / short is coming soon.</b> You&apos;ll be able to long or short any coin with SOL, and wins are paid from a locked on-chain vault without ever moving the chart.</p>
                : <SpotPanel coin={coin} side={mode} onDone={refreshAll} />}
            </section>

            {coin.leverage && (
              <section className="panel pad" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <h2>Long/short vault</h2>
                <div className="mono" style={{ fontSize: 20, fontWeight: 600 }}>{lev.vaultTotal.toFixed(2)} SOL</div>
                <p className="note">Locked on-chain. Only winning long/short positions can be paid from it. Filled by 1.9% of every trade.</p>
              </section>
            )}
          </aside>
        </div>
      </main>
    </>
  );
}

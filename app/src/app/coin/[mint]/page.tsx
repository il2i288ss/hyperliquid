"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { CoinAvatar } from "@/components/CoinAvatar";
import { CopyButton } from "@/components/CopyButton";
import { Socials } from "@/components/Socials";
import { VaultCard } from "@/components/VaultCard";
import { SpotPanel } from "@/components/SpotPanel";
import { LeveragePanel } from "@/components/LeveragePanel";
import { PositionsTable } from "@/components/PositionsTable";
import { PriceChart } from "@/components/PriceChart";
import { HoldersTable, TradesTable } from "@/components/ActivityTables";
import { SplitCoin } from "@/components/SplitCoin";
import type { Holder, Trade } from "@/lib/activity";
import { useLeverage } from "@/lib/useLeverage";
import { useLivePool } from "@/lib/useLivePool";
import { LEVERAGE_ENABLED, TOTAL_SUPPLY, explorer } from "@/lib/config";
import { age, price, short, usd } from "@/lib/format";
import { tierFor } from "@/lib/tiers";
import type { Coin } from "@/lib/coins";

type Mode = "buy" | "sell" | "lev";

export default function CoinPageRoute() {
  return (
    <Suspense fallback={<main className="page"><p className="muted">Loading…</p></main>}>
      <CoinPage />
    </Suspense>
  );
}

function CoinPage() {
  const { mint } = useParams<{ mint: string }>();
  const query = useSearchParams();
  const wantSide = query.get("side");
  const [base, setBase] = useState<Coin | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<Mode>(wantSide === "long" || wantSide === "short" ? "lev" : "buy");
  const [tab, setTab] = useState<"positions" | "trades" | "holders">("trades");
  const lev = useLeverage(mint);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [holders, setHolders] = useState<Holder[]>([]);
  const newest = useRef<string | undefined>(undefined);
  const loadingTrades = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/coins/${mint}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not load this coin");
      setBase(body.coin);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [mint]);

  /** Full history once, then only the trades newer than the last one we have. */
  const loadTrades = useCallback(async () => {
    if (loadingTrades.current) return;
    loadingTrades.current = true;
    try {
      const after = newest.current ? `?after=${newest.current}` : "";
      const r = await fetch(`/api/coins/${mint}/trades${after}`, { cache: "no-store" });
      if (!r.ok) return;
      const body: { trades: Trade[]; partial?: boolean } = await r.json();
      if (body.partial) {
        if (body.trades.length) setTrades((old) => [...body.trades, ...old]);
      } else setTrades(body.trades);
      if (body.trades[0]) newest.current = body.trades[0].sig;
    } finally {
      loadingTrades.current = false;
    }
  }, [mint]);

  const loadHolders = useCallback(async () => {
    const h = await fetch(`/api/coins/${mint}/holders`).then((r) => (r.ok ? r.json() : { holders: [] }));
    setHolders(h.holders ?? []);
  }, [mint]);

  // The pool account pushes every price change over the websocket; when it
  // does, pull the new trade straight away (and once more in case the RPC's
  // history index is a moment behind).
  const onPoolChange = useCallback(() => {
    setTimeout(() => loadTrades().catch(() => {}), 300);
    setTimeout(() => loadTrades().catch(() => {}), 1500);
  }, [loadTrades]);
  const livePool = useLivePool(base?.pool, onPoolChange);

  useEffect(() => {
    newest.current = undefined;
    load();
    loadTrades().catch(() => {});
    loadHolders().catch(() => {});
    const fast = setInterval(() => loadTrades().catch(() => {}), 3_000);
    const slow = setInterval(() => {
      load();
      loadHolders().catch(() => {});
    }, 10_000);
    return () => {
      clearInterval(fast);
      clearInterval(slow);
    };
  }, [load, loadTrades, loadHolders]);

  useEffect(() => {
    if (LEVERAGE_ENABLED && lev.positions.length) setTab((t) => (t === "trades" ? "positions" : t));
  }, [lev.positions.length]);

  // Live numbers: price and liquidity from the pool account the moment they change.
  const coin = useMemo<Coin | null>(() => {
    if (!base) return null;
    if (!livePool || livePool.at === 0) return base;
    const usdPerSol = base.priceSol > 0 ? base.priceUsd / base.priceSol : 0;
    return {
      ...base,
      priceSol: livePool.priceSol,
      priceUsd: livePool.priceSol * usdPerSol,
      mcapUsd: livePool.priceSol * TOTAL_SUPPLY * usdPerSol,
      quoteReserveSol: livePool.quoteSol,
      curveProgress: base.quoteReserveSol > 0 && base.curveProgress > 0 ? Math.min(1, base.curveProgress * (livePool.quoteSol / base.quoteReserveSol)) : base.curveProgress,
    };
  }, [base, livePool]);

  const refreshAll = () => {
    load();
    loadTrades().catch(() => {});
    loadHolders().catch(() => {});
    lev.refresh().catch(() => {});
  };

  if (error && !coin) return <main className="page"><p className="msg-err" role="alert">{error}</p></main>;
  if (!coin) return <main className="page"><p className="muted">Loading…</p></main>;

  const tier = tierFor(coin.mcapUsd);
  const solUsd = lev.global?.solUsd || (coin.priceSol > 0 ? coin.priceUsd / coin.priceSol : 0);
  const pct = Math.round(coin.curveProgress * 100);

  return (
    <main className="page coin-page">
      <section className="coin-head" aria-label={coin.name}>
        <div className="coin-id">
          <CoinAvatar mint={coin.mint} name={coin.name} image={coin.image} large expandable zoom />
          <div className="coin-id-text">
            <h1>{coin.name} <span>{coin.symbol}</span></h1>
            <div className="coin-meta">
              <CopyButton value={coin.mint} />
              <Socials links={coin.links} size={16} />
              <a href={explorer("address", coin.mint)} target="_blank" rel="noreferrer">Solscan ↗</a>
              <span>{age(coin.ageSeconds)} old</span>
              <span className="mono">by {short(coin.creator)}</span>
              {coin.leverage && <span className="ls-tag"><SplitCoin size={12} />Long / short · up to {tier.leverage}x</span>}
              {coin.graduated && <span className="ls-tag">Graduated</span>}
              {coin.main && <span className="ls-tag">Official coin</span>}
            </div>
          </div>
        </div>
        <dl className="coin-stats-row">
          <div className="big"><dt>Market cap</dt><dd>{usd(coin.mcapUsd)}</dd></div>
          <div><dt>Price</dt><dd>{price(coin.priceUsd)}</dd></div>
          <div><dt>Liquidity</dt><dd>{coin.quoteReserveSol.toFixed(2)} SOL</dd></div>
          {!coin.graduated && (
            <div className="curve">
              <dt>Bonding curve <span className="mono">{pct}%</span></dt>
              <dd><span className="curve-bar" role="progressbar" aria-label="Bonding curve progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${Math.max(2, pct)}%` }} /></span></dd>
            </div>
          )}
        </dl>
      </section>

      <div className="coin-grid">
        <div className="coin-col">
          <PriceChart trades={trades} solUsd={solUsd} coin={coin} livePriceSol={livePool?.priceSol} />

          <section className="panel">
            <div className="subtabs" role="tablist" aria-label="Activity">
              {([["trades", "Trades", trades.length], ["positions", "Positions", lev.positions.length], ["holders", "Holders", holders.length]] as const)
                .filter(([k]) => (LEVERAGE_ENABLED && !coin.main) || k !== "positions")
                .map(([k, label, n]) => (
                  <button key={k} type="button" role="tab" aria-selected={tab === k} className={`subtab${tab === k ? " on" : ""}`} onClick={() => setTab(k)}>
                    {label}{n > 0 && <span className="count">{n}</span>}
                  </button>
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

        <aside className="coin-side">
          <section className="panel pad trade-box">
            <div className={`tabs${coin.main ? "" : " three"}`} role="tablist" aria-label="Order type">
              {([["buy", "Buy"], ["sell", "Sell"], ["lev", "Long / Short"]] as const).filter(([k]) => !coin.main || k !== "lev").map(([k, label]) => (
                <button key={k} type="button" role="tab" aria-selected={mode === k} className={`tab${mode === k ? " on" : ""}`} onClick={() => setMode(k)}>
                  {k === "lev" && <SplitCoin size={13} />}{label}
                </button>
              ))}
            </div>
            {mode === "lev" && !coin.main
              ? LEVERAGE_ENABLED
                ? <LeveragePanel coin={coin} lev={lev} onDone={refreshAll} initialLong={wantSide !== "short"} />
                : <p className="note">Long / short isn&apos;t switched on for this site yet.</p>
              : <SpotPanel coin={coin} side={mode === "sell" ? "sell" : "buy"} onDone={refreshAll} />}
          </section>

          {LEVERAGE_ENABLED && !coin.main && <VaultCard coin={coin} lev={lev} />}
          {coin.description && (
            <section className="panel pad about">
              <h2>About</h2>
              <p>{coin.description}</p>
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}

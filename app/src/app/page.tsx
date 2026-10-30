"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CoinAvatar } from "@/components/CoinAvatar";
import { age, price, usd } from "@/lib/format";
import { tierFor } from "@/lib/tiers";
import { useCoins } from "@/lib/useCoins";
import type { Coin } from "@/lib/coins";

const GRADUATING_FROM = 0.5; // curve progress where a coin moves to "About to graduate"

function CoinRow({ c }: { c: Coin }) {
  const tier = tierFor(c.mcapUsd);
  return (
    <Link href={`/coin/${c.mint}`} className="coin-row">
      <CoinAvatar mint={c.mint} name={c.name} />
      <div className="coin-main">
        <div className="coin-title">
          <b>{c.name}</b>
          <span className="muted">${c.symbol}</span>
          <span className="muted mono" style={{ fontSize: 12 }}>{age(c.ageSeconds)}</span>
          {c.leverage && <span className="badge">L/S {tier.leverage}x</span>}
        </div>
        <div className="coin-stats">
          <span>MC <b>{usd(c.mcapUsd)}</b></span>
          <span>Price <b>{price(c.priceUsd)}</b></span>
          <span>Pool <b>{c.quoteReserveSol.toFixed(2)} SOL</b></span>
        </div>
        {!c.graduated && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className="bar" role="progressbar" aria-label="Bonding curve progress" aria-valuenow={Math.round(c.curveProgress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div style={{ width: `${c.curveProgress * 100}%`, background: c.curveProgress > 0.8 ? "var(--warn)" : "var(--accent)" }} />
            </div>
            <span className="mono muted" style={{ fontSize: 11 }}>{Math.round(c.curveProgress * 100)}%</span>
          </div>
        )}
      </div>
      <span className="btn buy" aria-hidden="true">Trade</span>
    </Link>
  );
}

function Column({ title, hint, coins }: { title: string; hint: string; coins: Coin[] }) {
  return (
    <section className="panel" style={{ minWidth: 0 }}>
      <div className="panel-head"><h2>{title}</h2><span className="muted" style={{ fontSize: 12 }}>{hint}</span></div>
      {coins.length ? coins.slice(0, 40).map((c) => <CoinRow key={c.mint} c={c} />) : <p className="empty">Nothing here yet.</p>}
    </section>
  );
}

function Discover() {
  const { coins, error } = useCoins();
  const q = (useSearchParams().get("q") ?? "").toLowerCase();
  const list = (coins ?? []).filter(
    (c) => !q || c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q) || c.mint === q,
  );
  const fresh = list.filter((c) => !c.graduated && c.curveProgress < GRADUATING_FROM);
  const graduating = list.filter((c) => !c.graduated && c.curveProgress >= GRADUATING_FROM).sort((a, b) => b.curveProgress - a.curveProgress);
  const graduated = list.filter((c) => c.graduated).sort((a, b) => b.mcapUsd - a.mcapUsd);

  return (
    <main className="page">
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div className="muted" style={{ fontSize: 12 }}>
          {coins ? `${coins.length} coins launched` : "Loading coins…"}
          {q && <> · results for “{q}” · <Link href="/">clear</Link></>}
        </div>
        <Link href="/launch" className="btn warn">Launch a coin</Link>
      </div>
      {error && <p className="msg-err">{error}</p>}
      <div className="columns">
        <Column title="New launches" hint="Snipers pay 90% in the launch block" coins={fresh} />
        <Column title="About to graduate" hint="Bonding curve progress" coins={graduating} />
        <Column title="Graduated" hint="Trading on Meteora" coins={graduated} />
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Discover />
    </Suspense>
  );
}

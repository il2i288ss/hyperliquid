"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CoinAvatar } from "@/components/CoinAvatar";
import { CopyButton } from "@/components/CopyButton";
import { age, price, usd } from "@/lib/format";
import { tierFor } from "@/lib/tiers";
import { useCoins } from "@/lib/useCoins";
import type { Coin } from "@/lib/coins";
import { Icon } from "@/components/Icon";

const SORTS = {
  new: { label: "Newest", fn: (a: Coin, b: Coin) => a.ageSeconds - b.ageSeconds },
  old: { label: "Oldest", fn: (a: Coin, b: Coin) => b.ageSeconds - a.ageSeconds },
  mcapHigh: { label: "Market cap ↓", fn: (a: Coin, b: Coin) => b.mcapUsd - a.mcapUsd },
  mcapLow: { label: "Market cap ↑", fn: (a: Coin, b: Coin) => a.mcapUsd - b.mcapUsd },
} as const;
type SortKey = keyof typeof SORTS;

function readPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
function writePref(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* private mode */
  }
}

function Row({ c }: { c: Coin }) {
  const tier = tierFor(c.mcapUsd);
  return (
    <Link href={`/coin/${c.mint}`} className="grid-row">
      <div className="who">
        <CoinAvatar mint={c.mint} name={c.name} image={c.image} />
        <div>
          <b>{c.name}</b>
          <span className="muted" style={{ fontSize: 12 }}>${c.symbol}</span>
          <span style={{ marginLeft: -6 }}><CopyButton value={c.mint} label="" /></span>
        </div>
      </div>
      <div><span className="cell-label">Age</span>{age(c.ageSeconds)}</div>
      <div><span className="cell-label">MC</span><b>{usd(c.mcapUsd)}</b></div>
      <div><span className="cell-label">Price</span>{price(c.priceUsd)}</div>
      <div><span className="cell-label">Liquidity</span>{c.quoteReserveSol.toFixed(2)} SOL</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {c.graduated ? (
          <span className="badge grad">Graduated</span>
        ) : (
          <>
            <div className="bar" style={{ minWidth: 50 }} role="progressbar" aria-label="Bonding curve progress" aria-valuenow={Math.round(c.curveProgress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div style={{ width: `${c.curveProgress * 100}%`, background: c.curveProgress > 0.8 ? "var(--warn)" : "var(--accent)" }} />
            </div>
            <span className="muted">{Math.round(c.curveProgress * 100)}%</span>
          </>
        )}
        {c.leverage && <span className="badge ls">L/S {tier.leverage}x</span>}
      </div>
      <div className="trade"><span className="btn buy" aria-hidden="true">Trade</span></div>
    </Link>
  );
}

function Discover() {
  const { coins, error } = useCoins();
  const q = (useSearchParams().get("q") ?? "").toLowerCase();
  const [sort, setSort] = useState<SortKey>("new");
  const [lsOnly, setLsOnly] = useState(false);
  const [hideGrad, setHideGrad] = useState(false);

  useEffect(() => {
    const s = readPref<SortKey>("discover.sort", "new");
    setSort(s in SORTS ? s : "new");
    setLsOnly(readPref("discover.ls", false));
    setHideGrad(readPref("discover.hideGrad", false));
  }, []);
  const pick = (s: SortKey) => {
    setSort(s);
    writePref("discover.sort", s);
  };

  const list = useMemo(
    () =>
      (coins ?? [])
        .filter((c) => !q || c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q) || c.mint.toLowerCase() === q)
        .filter((c) => !lsOnly || c.leverage)
        .filter((c) => !hideGrad || !c.graduated)
        .sort(SORTS[sort].fn),
    [coins, q, lsOnly, hideGrad, sort],
  );

  const head = (label: string, asc: SortKey, desc: SortKey) => (
    <button type="button" className={sort === asc || sort === desc ? "on" : ""} onClick={() => pick(sort === desc ? asc : desc)}>
      {label} {sort === desc ? "↓" : sort === asc ? "↑" : ""}
    </button>
  );

  return (
    <main className="page">
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, letterSpacing: "-.01em" }}>
            Every coin has <span style={{ color: "var(--long)" }}>two</span> <span style={{ color: "var(--short)" }}>sides.</span>
          </h1>
          <div className="muted" style={{ fontSize: 13, margin: "2px 0 4px" }}>Launch for 0.03 SOL. Holders earn SOL every 15 min. Long or short any coin.</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {coins ? `${coins.length} coins launched` : "Loading coins…"}
            {q && <> · results for “{q}” · <Link href="/">clear</Link></>}
          </div>
        </div>
        <Link href="/launch" className="cta" style={{ width: "auto", minHeight: 38, padding: "0 18px", display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
          <Icon name="rocket" size={16} />Launch a coin
        </Link>
      </div>
      {error && <p className="msg-err">{error}</p>}

      <section className="panel" style={{ minWidth: 0 }}>
        <div className="toolbar">
          <div className="seg" role="group" aria-label="Sort coins">
            {(Object.keys(SORTS) as SortKey[]).map((k) => (
              <button key={k} type="button" className={sort === k ? "on" : ""} aria-pressed={sort === k} onClick={() => pick(k)}>
                {SORTS[k].label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <label className="toggle">
              <input type="checkbox" checked={lsOnly} onChange={(e) => { setLsOnly(e.target.checked); writePref("discover.ls", e.target.checked); }} />
              Long/short live
            </label>
            <label className="toggle">
              <input type="checkbox" checked={hideGrad} onChange={(e) => { setHideGrad(e.target.checked); writePref("discover.hideGrad", e.target.checked); }} />
              Hide graduated
            </label>
          </div>
        </div>
        <div className="grid-head">
          <span>Coin</span>
          {head("Age", "old", "new")}
          {head("Market cap", "mcapLow", "mcapHigh")}
          <span>Price</span>
          <span>Liquidity</span>
          <span>Bonding curve</span>
          <span />
        </div>
        {coins && !list.length && <p className="empty">{q || lsOnly || hideGrad ? "No coins match these filters." : "No coins yet. Be the first to launch one."}</p>}
        {list.slice(0, 200).map((c) => <Row key={c.mint} c={c} />)}
      </section>
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

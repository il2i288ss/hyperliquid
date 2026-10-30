"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CoinAvatar } from "@/components/CoinAvatar";
import { CopyButton } from "@/components/CopyButton";
import { Socials } from "@/components/Socials";
import { SplitCoin } from "@/components/SplitCoin";
import { age, price, usd } from "@/lib/format";
import { tierFor } from "@/lib/tiers";
import { useCoins } from "@/lib/useCoins";
import { useLeverage } from "@/lib/useLeverage";
import { LEVERAGE_ENABLED } from "@/lib/config";
import type { Coin } from "@/lib/coins";

const SORTS = {
  new: { label: "Newest", fn: (a: Coin, b: Coin) => a.ageSeconds - b.ageSeconds },
  old: { label: "Oldest", fn: (a: Coin, b: Coin) => b.ageSeconds - a.ageSeconds },
  mcap: { label: "Market cap", fn: (a: Coin, b: Coin) => b.mcapUsd - a.mcapUsd },
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

/** Pinned labels on the banner art. Positions are on the 1440×680 artwork. */
const PINS = [
  { node: [900, 216], tag: [772, 136], text: "Long · up to 10x" },
  { node: [1180, 122], tag: [1196, 92], text: "Holders paid every 15 min" },
  { node: [1286, 402], tag: [1290, 456], text: "Short · paid in SOL" },
  { node: [968, 410], tag: [812, 470], text: "TP / SL at any market cap" },
] as const;

function Hero() {
  return (
    <section className="hero2" aria-label="Obverse">
      <div className="hero2-art" aria-hidden="true">
        <div className="hero2-canvas">
          <img src="/brand/hole-glyphs.webp" alt="" width={1440} height={680} fetchPriority="high" />
          <div className="hero2-fade" />
          <svg className="hero2-pins" width="1440" height="680" viewBox="0 0 1440 680" fill="none">
            {PINS.map((p) => (
              <g key={p.text}>
                <path d={`M${p.node[0]} ${p.node[1]} L${p.tag[0] + 24} ${p.tag[1] + (p.tag[1] > p.node[1] ? 0 : 24)}`} stroke="rgba(238,238,243,0.7)" />
                <rect x={p.node[0] - 3} y={p.node[1] - 3} width="6" height="6" fill="#060510" stroke="rgba(238,238,243,0.7)" />
              </g>
            ))}
          </svg>
          {PINS.map((p) => (
            <span key={p.text} className="pin" style={{ left: p.tag[0], top: p.tag[1] }}>{p.text}</span>
          ))}
        </div>
      </div>
      <div className="hero2-text">
        <h1>Launch a coin<br /><span>Trade both sides</span></h1>
        <p>Holders earn SOL every 15 minutes from the coin&apos;s tax. Every coin opens its own long and short market.</p>
        <div className="hero2-actions">
          <Link href="/launch" className="btn-primary">Launch a coin</Link>
          <Link href="/docs" className="btn-text">How it works →</Link>
        </div>
      </div>
    </section>
  );
}

/** Long / short status for one coin, all live: vault, open interest, leverage. */
function Ticket({ coin }: { coin: Coin }) {
  const lev = useLeverage(coin.mint);
  if (coin.main) {
    return (
      <aside className="ticket" aria-label={coin.symbol}>
        <div className="ticket-head"><span>{coin.symbol} · Official coin</span><span className="mono muted">MC {usd(coin.mcapUsd)}</span></div>
        <div className="rows">
          <div><span>Price</span><span>{price(coin.priceUsd)}</span></div>
          <div><span>Liquidity</span><span>{coin.quoteReserveSol.toFixed(2)} SOL</span></div>
        </div>
        <Link href={`/coin/${coin.mint}`} className="btn-primary wide">Buy {coin.symbol}</Link>
        <p className="note">The platform&apos;s own coin. Buy and sell only; long / short isn&apos;t offered on it.</p>
      </aside>
    );
  }
  return <LsTicket coin={coin} lev={lev} />;
}

function LsTicket({ coin, lev }: { coin: Coin; lev: ReturnType<typeof useLeverage> }) {
  const [long, setLong] = useState(true);
  const tier = tierFor(coin.mcapUsd);
  const m = lev.market;
  const live = Boolean(m?.enabled);
  return (
    <aside className="ticket" aria-label={`Long or short ${coin.symbol}`}>
      <div className="ticket-head">
        <span>Trade {coin.symbol}</span>
        <span className="mono muted">MC {usd(coin.mcapUsd)}</span>
      </div>
      <div className="tabs" role="group" aria-label="Side">
        <button type="button" className={`tab${long ? " on" : ""}`} aria-pressed={long} onClick={() => setLong(true)}><SplitCoin size={14} side="long" />Long</button>
        <button type="button" className={`tab${!long ? " on" : ""}`} aria-pressed={!long} onClick={() => setLong(false)}><SplitCoin size={14} side="short" />Short</button>
      </div>
      <div className="rows">
        <div><span>Leverage</span><span>up to {tier.leverage}x</span></div>
        <div><span>Long open on {coin.symbol}</span><span>{(m?.oiLong ?? 0).toFixed(2)} SOL</span></div>
        <div><span>Short open on {coin.symbol}</span><span>{(m?.oiShort ?? 0).toFixed(2)} SOL</span></div>
        <div><span>Vault available</span><span>{lev.loaded ? `${lev.vaultFree.toFixed(2)} SOL` : "…"}</span></div>
      </div>
      <Link href={`/coin/${coin.mint}${LEVERAGE_ENABLED ? `?side=${long ? "long" : "short"}` : ""}`} className="btn-primary wide">
        {live ? `${long ? "Long" : "Short"} ${coin.symbol}` : `Open ${coin.symbol}`}
      </Link>
      <p className="note">
        {live
          ? "Wins are paid in SOL from the vault. Positions never buy or sell the coin, so they never move the chart."
          : `Long / short opens on ${coin.symbol} once it has enough liquidity. Until then you can buy and sell it.`}
      </p>
    </aside>
  );
}

function Row({ c, on, pick }: { c: Coin; on: boolean; pick: () => void }) {
  const tier = tierFor(c.mcapUsd);
  return (
    <Link href={`/coin/${c.mint}`} className={`row2${on ? " on" : ""}`} onMouseEnter={pick} onFocus={pick}>
      <div className="who">
        <CoinAvatar mint={c.mint} name={c.name} image={c.image} zoom />
        <div>
          <span className="name-line"><b>{c.name}</b><span className="muted">{c.symbol}</span>{c.main && <span className="ls-tag">Official</span>}{c.leverage && <span className="ls-tag" title="Long / short is open"><SplitCoin size={11} />{tier.leverage}x</span>}</span>
          <span className="meta-line">
            <CopyButton value={c.mint} label="" />
            <Socials links={c.links} size={14} />
          </span>
        </div>
      </div>
      <span className="num muted"><span className="cell-label">Age</span>{age(c.ageSeconds)}</span>
      <span className="num strong"><span className="cell-label">MC</span>{usd(c.mcapUsd)}</span>
      <span className="num muted"><span className="cell-label">Price</span>{price(c.priceUsd)}</span>
      <span className="num muted"><span className="cell-label">Liquidity</span>{c.quoteReserveSol.toFixed(2)} SOL</span>
    </Link>
  );
}

function Discover() {
  const { coins, error } = useCoins();
  const q = (useSearchParams().get("q") ?? "").toLowerCase();
  const [sort, setSort] = useState<SortKey>("new");
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    const s = readPref<SortKey>("discover.sort", "new");
    setSort(s in SORTS ? s : "new");
  }, []);
  const pick = (s: SortKey) => {
    setSort(s);
    writePref("discover.sort", s);
  };

  const list = useMemo(
    () =>
      (coins ?? [])
        .filter((c) => !q || c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q) || c.mint.toLowerCase() === q)
        .sort(SORTS[sort].fn),
    [coins, q, sort],
  );
  const selected = list.find((c) => c.mint === picked) ?? list.find((c) => c.leverage) ?? list[0];

  return (
    <main className="home">
      <Hero />
      {q && <div className="muted results">Results for “{q}” · <Link href="/">Clear</Link></div>}
      {error && <p className="msg-err">{error}</p>}

      <section className={`terminal${selected ? "" : " solo"}`} aria-label="Coins">
        <div className="terminal-list">
          <div className="toolbar">
            <h2>Coins {coins && <span className="count">{list.length}</span>}</h2>
            <div className="seg" role="group" aria-label="Sort coins">
              {(Object.keys(SORTS) as SortKey[]).map((k) => (
                <button key={k} type="button" className={sort === k ? "on" : ""} aria-pressed={sort === k} onClick={() => pick(k)}>{SORTS[k].label}</button>
              ))}
            </div>
          </div>
          <div className="table-wrap">
            <div className="rows2">
              <div className="head2"><span>Coin</span><span className="num">Age</span><span className="num">Market cap</span><span className="num">Price</span><span className="num">Liquidity</span></div>
              {!coins && <p className="empty">Loading coins…</p>}
              {coins && !list.length && <p className="empty">{q ? "No coins match your search" : "No coins yet. Be the first to launch one"}</p>}
              {list.slice(0, 200).map((c) => <Row key={c.mint} c={c} on={c.mint === selected?.mint} pick={() => setPicked(c.mint)} />)}
            </div>
          </div>
        </div>
        {selected && <Ticket coin={selected} />}
      </section>

      <footer className="foot">
        <span><SplitCoin size={12} />Obverse · built on Solana</span>
        <span>Memecoins are high risk. Trade what you can lose</span>
      </footer>
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

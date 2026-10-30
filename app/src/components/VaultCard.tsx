"use client";

import { explorer } from "@/lib/config";
import { tierFor } from "@/lib/tiers";
import type { Coin } from "@/lib/coins";
import type { LeverageState } from "@/lib/useLeverage";
import { SplitCoin } from "./SplitCoin";

/** The long/short vault: what it can pay out, and what's open on this coin right now. */
export function VaultCard({ coin, lev }: { coin: Coin; lev: LeverageState }) {
  const tier = tierFor(coin.mcapUsd);
  const m = lev.market;
  const poolCap = ((m?.poolSol ?? coin.quoteReserveSol) * tier.oiCapPctOfPool) / 100;
  const vaultCap = lev.vaultFree * 0.05;
  const cap = m?.capacity ?? Math.min(poolCap, vaultCap);
  const longOpen = m?.oiLong ?? 0;
  const shortOpen = m?.oiShort ?? 0;
  const open = longOpen + shortOpen;
  const longPct = open > 0 ? (longOpen / open) * 100 : 50;

  return (
    <section className="panel pad vault-card" aria-label="Long and short vault">
      <div className="vault-head">
        <h2><SplitCoin size={16} />Long and short vault</h2>
        {lev.vaultAddress && <a href={explorer("address", lev.vaultAddress)} target="_blank" rel="noreferrer">Solscan ↗</a>}
      </div>

      <div className="vault-figure">
        <span>Available to back positions</span>
        <b className="mono">{lev.loaded ? lev.vaultFree.toFixed(2) : "…"} <small>SOL</small></b>
        <span className="mono muted">of {lev.vaultTotal.toFixed(2)} SOL in the vault</span>
      </div>

      <div className="vault-split">
        <div className={`split-bar${open > 0 ? "" : " empty"}`} aria-hidden="true">
          <span style={{ width: `${longPct}%` }} />
          <span />
        </div>
        <div className="split-legend mono">
          <span>Long {longOpen.toFixed(2)} SOL open</span>
          <span>Short {shortOpen.toFixed(2)} SOL open</span>
        </div>
      </div>

      <p className="note">
        {m?.enabled
          ? <>Room left on ${coin.symbol}: <span className="mono">{Math.max(0, cap - longOpen).toFixed(2)}</span> SOL long, <span className="mono">{Math.max(0, cap - shortOpen).toFixed(2)}</span> SOL short. It grows as the vault and the coin grow.</>
          : <>Long / short opens on ${coin.symbol} once it has enough liquidity. Then up to <span className="mono">{cap.toFixed(2)}</span> SOL per side can be open at today&apos;s size.</>}
      </p>
      <p className="note">
        {lev.mode === "bot"
          ? "A public wallet anyone can check. It only pays winning positions, automatically, and it's filled by 1.9% of every trade."
          : "Locked on-chain: nobody can withdraw it. It only pays winning positions, and it's filled by 1.9% of every trade."}
      </p>
    </section>
  );
}

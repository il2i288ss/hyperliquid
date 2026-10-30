"use client";

import { explorer } from "@/lib/config";
import { vaultPda } from "@/lib/leverage";
import { tierFor } from "@/lib/tiers";
import { sol } from "@/lib/format";
import type { Coin } from "@/lib/coins";
import type { LeverageState } from "@/lib/useLeverage";
import { Icon } from "./Icon";

/** How much of the vault this coin can use for longs and shorts right now. */
export function VaultCard({ coin, lev }: { coin: Coin; lev: LeverageState }) {
  const tier = tierFor(coin.mcapUsd);
  const m = lev.market;
  const poolCap = ((m?.poolSol ?? coin.quoteReserveSol) * tier.oiCapPctOfPool) / 100;
  const vaultCap = lev.vaultFree * 0.05;
  const cap = Math.min(poolCap, vaultCap);
  const longUsed = m?.oiLong ?? 0;
  const shortUsed = m?.oiShort ?? 0;
  const side = (label: string, used: number, color: string) => {
    const left = Math.max(0, cap - used);
    const pct = cap > 0 ? Math.min(100, (used / cap) * 100) : 0;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
          <span className="muted">{label}</span>
          <span className="mono"><b style={{ color }}>{left.toFixed(3)}</b> <span className="muted">/ {cap.toFixed(3)} SOL left</span></span>
        </div>
        <div className="meter" role="meter" aria-label={`${label} capacity used`} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
          <div style={{ width: `${pct}%`, background: color }} />
        </div>
      </div>
    );
  };

  return (
    <section className="panel pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}><Icon name="lock" />Long/short vault</h2>
        <a href={explorer("address", vaultPda().toBase58())} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>Solscan <Icon name="external" size={12} /></a>
      </div>
      <div className="rows" style={{ borderTop: 0, paddingTop: 0 }}>
        <div><span>Vault balance</span><span>{sol(lev.vaultTotal, 2)}</span></div>
        <div><span>Available to back positions</span><span>{sol(lev.vaultFree, 2)}</span></div>
      </div>
      <div className="vault-box">
        <div style={{ fontSize: 12, fontWeight: 600 }}>Room on ${coin.symbol}</div>
        {m?.enabled ? (
          <>
            {side("Longs", longUsed, "var(--long)")}
            {side("Shorts", shortUsed, "var(--short)")}
            <p className="note">
              Each side can hold up to {cap === vaultCap ? "5% of the available vault" : `${tier.oiCapPctOfPool}% of this coin's pool liquidity`}
              {" "}(whichever is smaller). It grows as the vault and the coin grow.
            </p>
          </>
        ) : (
          <p className="note">Long/short isn&apos;t live on this coin yet. Once it is, up to {sol(cap)} per side can be opened at today&apos;s size.</p>
        )}
      </div>
      <p className="note">Locked on-chain: nobody can withdraw it. It only pays winning positions, and it&apos;s filled by 1.9% of every trade.</p>
    </section>
  );
}

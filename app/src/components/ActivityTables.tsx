"use client";

import type { Holder, Trade } from "@/lib/activity";
import { explorer } from "@/lib/config";
import { price, short } from "@/lib/format";

const ago = (t: number) => {
  const s = Math.max(0, Date.now() / 1000 - t);
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};

export function TradesTable({ trades, solUsd, symbol }: { trades: Trade[]; solUsd: number; symbol: string }) {
  if (!trades.length) return <p className="empty">No trades yet.</p>;
  return (
    <div className="table-wrap">
      <table className="data">
        <thead><tr><th>Age</th><th>Type</th><th>SOL</th><th>${symbol}</th><th>Price</th><th>Trader</th><th><span className="sr">Transaction</span></th></tr></thead>
        <tbody>
          {trades.slice(0, 50).map((t) => (
            <tr key={t.sig}>
              <td className="muted">{ago(t.time)}</td>
              <td className={t.side === "buy" ? "up" : "down"} style={{ fontFamily: "var(--sans)", fontWeight: 600 }}>{t.side === "buy" ? "Buy" : "Sell"}</td>
              <td>{t.sol.toFixed(4)}</td>
              <td>{Math.round(t.tokens).toLocaleString()}</td>
              <td>{price(t.priceSol * solUsd)}</td>
              <td><a href={explorer("address", t.trader)} target="_blank" rel="noreferrer">{short(t.trader)}</a></td>
              <td><a href={explorer("tx", t.sig)} target="_blank" rel="noreferrer">tx</a></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HoldersTable({ holders }: { holders: Holder[] }) {
  if (!holders.length) return <p className="empty">No holders yet.</p>;
  return (
    <div className="table-wrap">
      <table className="data" style={{ minWidth: 480 }}>
        <thead><tr><th>#</th><th>Holder</th><th>Tokens</th><th>Share of supply</th></tr></thead>
        <tbody>
          {holders.map((h, i) => (
            <tr key={h.owner}>
              <td className="muted">{i + 1}</td>
              <td>{h.label ? <span className="badge">{h.label}</span> : <a href={explorer("address", h.owner)} target="_blank" rel="noreferrer">{short(h.owner)}</a>}</td>
              <td>{Math.round(h.tokens).toLocaleString()}</td>
              <td>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div className="bar" style={{ maxWidth: 120 }}><div style={{ width: `${Math.min(100, h.pct)}%`, background: h.label ? "var(--muted)" : "var(--accent)" }} /></div>
                  {h.pct.toFixed(2)}%
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

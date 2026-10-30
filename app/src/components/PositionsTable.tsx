"use client";

import { useEffect, useState } from "react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { closePositionIx, leverageError, type Position } from "@/lib/leverage";
import { TEST_HOLD_SECS, TIERS } from "@/lib/tiers";
import { explorer } from "@/lib/config";
import { price } from "@/lib/format";
import type { Coin } from "@/lib/coins";

/** Raw-unit entry price (lamports per raw token, scaled) -> SOL per whole token. */
const toSolPerToken = (p: number) => (p * 1e6) / 1e9;

export function PositionsTable({ coin, positions, solUsd, testBuild, onDone }: {
  coin: Coin; positions: Position[]; solUsd: number; testBuild: boolean; onDone: () => void;
}) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [now, setNow] = useState(() => Date.now() / 1000);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; err?: string; sig?: string }>({});

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(t);
  }, []);

  if (!publicKey) return <p className="empty">Connect your wallet to see your positions.</p>;
  if (!positions.length) return <p className="empty">No open positions on ${coin.symbol}.</p>;

  async function close(p: Position) {
    setBusy(p.address.toBase58());
    setMsg({});
    try {
      const tx = new Transaction().add(closePositionIx(publicKey!, new PublicKey(coin.mint), p.nonce));
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");
      setMsg({ ok: "Closed. SOL sent to your wallet.", sig });
      onDone();
    } catch (e) {
      setMsg({ err: leverageError(e) });
    } finally {
      setBusy("");
    }
  }

  return (
    <div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>Side</th><th>Size</th><th>Margin</th><th>Entry</th><th>Mark</th><th>Liq. price</th><th>PnL (est.)</th><th><span className="sr">Action</span></th></tr>
          </thead>
          <tbody>
            {positions.map((p) => {
              const lev = Math.round(p.notional / p.margin);
              const entry = toSolPerToken(p.entryPrice);
              const liq = p.long ? entry * (1 - 0.9 / lev) : entry * (1 + 0.9 / lev);
              const raw = p.long ? p.notional * (coin.priceSol / entry - 1) : p.notional * (1 - coin.priceSol / entry);
              const pnl = Math.min(raw, p.margin * (TIERS[p.tier]?.profitCapX ?? 5));
              const hold = testBuild ? TEST_HOLD_SECS : TIERS[p.tier]?.minHoldSecs ?? 60;
              const wait = Math.ceil(p.openedAt + hold - now);
              const id = p.address.toBase58();
              return (
                <tr key={id}>
                  <td style={{ fontFamily: "var(--sans)", fontWeight: 600 }} className={p.long ? "up" : "down"}>{p.long ? "Long" : "Short"} {lev}x</td>
                  <td>{p.notional.toFixed(3)} SOL</td>
                  <td>{p.margin.toFixed(3)} SOL</td>
                  <td>{price(entry * solUsd)}</td>
                  <td>{price(coin.priceSol * solUsd)}</td>
                  <td className="warn">{price(liq * solUsd)}</td>
                  <td className={pnl >= 0 ? "up" : "down"}>{pnl >= 0 ? "+" : "−"}{Math.abs(pnl).toFixed(4)} SOL ({((pnl / p.margin) * 100).toFixed(0)}%)</td>
                  <td style={{ textAlign: "right" }}>
                    <button type="button" className="btn" disabled={wait > 0 || busy === id} onClick={() => close(p)}>
                      {busy === id ? "Closing…" : wait > 0 ? `Close in ${wait}s` : "Close"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {msg.ok && <p className="msg-ok" style={{ padding: "0 14px 12px" }}>{msg.ok} <a href={explorer("tx", msg.sig!)} target="_blank" rel="noreferrer">View transaction</a></p>}
      {msg.err && <p className="msg-err" role="alert" style={{ padding: "0 14px 12px" }}>{msg.err}</p>}
      <p className="note" style={{ padding: "0 14px 12px" }}>PnL shown at the current spot price. The actual payout uses the averaged price and includes price impact and the close fee.</p>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { botPost, closePositionIx, leverageError, setTriggersIx, signAction, type Position } from "@/lib/leverage";
import { TEST_HOLD_SECS, TIERS } from "@/lib/tiers";
import { LEVERAGE_MODE, LS_API, explorer } from "@/lib/config";
import { parseUsd, price, usd } from "@/lib/format";
import type { Coin } from "@/lib/coins";

/** Raw-unit entry price (lamports per raw token, scaled) -> SOL per whole token. */
const toSolPerToken = (p: number) => (p * 1e6) / 1e9;

export function PositionsTable({ coin, positions, solUsd, testBuild, onDone }: {
  coin: Coin; positions: Position[]; solUsd: number; testBuild: boolean; onDone: () => void;
}) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, signMessage } = useWallet();
  const [now, setNow] = useState(() => Date.now() / 1000);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; err?: string; sig?: string }>({});
  const [edit, setEdit] = useState<{ id: string; tp: string; sl: string } | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(t);
  }, []);

  if (!publicKey) return <p className="empty">Connect your wallet to see your positions.</p>;
  if (!positions.length) return <p className="empty">No open positions on ${coin.symbol}.</p>;

  async function close(p: Position) {
    setBusy(p.id ?? p.address.toBase58());
    setMsg({});
    try {
      if (LEVERAGE_MODE === "bot") {
        const { message, signature } = await signAction(signMessage, `Obverse: close ${p.id}`);
        const r = await botPost(LS_API, "/ls/close", { owner: publicKey!.toBase58(), id: p.id, message, signature });
        setMsg({ ok: `Closed. ${(Number(r.payout) / 1e9).toFixed(4)} SOL is on its way to your wallet.` });
        onDone();
        return;
      }
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

  async function saveTriggers(p: Position) {
    if (!edit) return;
    const tp = parseUsd(edit.tp);
    const sl = parseUsd(edit.sl);
    const mc = coin.mcapUsd;
    const bad =
      (edit.tp && !tp) || (edit.sl && !sl) ? "Enter market caps like 250k or 1.5m (or leave empty)." :
      tp && (p.long ? tp <= mc : tp >= mc) ? `Take profit must be ${p.long ? "above" : "below"} the current market cap (${usd(mc)}).` :
      sl && (p.long ? sl >= mc : sl <= mc) ? `Stop loss must be ${p.long ? "below" : "above"} the current market cap (${usd(mc)}).` :
      "";
    if (bad) return setMsg({ err: bad });
    setBusy(p.id ?? p.address.toBase58());
    setMsg({});
    try {
      if (LEVERAGE_MODE === "bot") {
        const { message, signature } = await signAction(signMessage, `Obverse: set TP ${Math.round(tp)} SL ${Math.round(sl)} on ${p.id}`);
        await botPost(LS_API, "/ls/triggers", { owner: publicKey!.toBase58(), id: p.id, tp: Math.round(tp), sl: Math.round(sl), message, signature });
        setMsg({ ok: tp || sl ? "Take profit / stop loss saved." : "Take profit / stop loss removed." });
        setEdit(null);
        onDone();
        return;
      }
      const sig = await sendTransaction(new Transaction().add(setTriggersIx(publicKey!, new PublicKey(coin.mint), p.nonce, sl, tp)), connection);
      await connection.confirmTransaction(sig, "confirmed");
      setMsg({ ok: tp || sl ? "Take profit / stop loss saved." : "Take profit / stop loss removed.", sig });
      setEdit(null);
      onDone();
    } catch (e) {
      setMsg({ err: leverageError(e) });
    } finally {
      setBusy("");
    }
  }

  const fmt = (v: number) => (v ? usd(v) : "—");

  return (
    <div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>Side</th><th>Size</th><th>Margin</th><th>Entry</th><th>Mark</th><th>Liq. price</th><th>PnL (est.)</th><th>TP / SL (MC)</th><th><span className="sr">Action</span></th></tr>
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
              const id = p.id ?? p.address.toBase58();
              return (
                <tr key={id}>
                  <td style={{ fontFamily: "var(--sans)", fontWeight: 600 }} className={p.long ? "up" : "down"}>{p.long ? "Long" : "Short"} {lev}x</td>
                  <td>{p.notional.toFixed(3)} SOL</td>
                  <td>{p.margin.toFixed(3)} SOL</td>
                  <td>{price(entry * solUsd)}</td>
                  <td>{price(coin.priceSol * solUsd)}</td>
                  <td className="warn">{price(liq * solUsd)}</td>
                  <td className={pnl >= 0 ? "up" : "down"}>{pnl >= 0 ? "+" : "−"}{Math.abs(pnl).toFixed(4)} SOL ({((pnl / p.margin) * 100).toFixed(0)}%)</td>
                  <td>
                    {edit?.id === id ? (
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input className="input" style={{ width: 90, minHeight: 32, fontSize: 12, padding: "4px 8px" }} aria-label="Take profit market cap" placeholder="TP" value={edit.tp} onChange={(e) => setEdit({ ...edit, tp: e.target.value })} />
                        <input className="input" style={{ width: 90, minHeight: 32, fontSize: 12, padding: "4px 8px" }} aria-label="Stop loss market cap" placeholder="SL" value={edit.sl} onChange={(e) => setEdit({ ...edit, sl: e.target.value })} />
                        <button type="button" className="btn" disabled={busy === id} onClick={() => saveTriggers(p)}>Save</button>
                        <button type="button" className="btn" onClick={() => setEdit(null)}>Cancel</button>
                      </div>
                    ) : (
                      <button type="button" className="copy" style={{ fontFamily: "var(--mono)" }} onClick={() => setEdit({ id, tp: p.tpMcapUsd ? String(p.tpMcapUsd) : "", sl: p.slMcapUsd ? String(p.slMcapUsd) : "" })} aria-label="Edit take profit and stop loss">
                        <span className="up">{fmt(p.tpMcapUsd)}</span> / <span className="down">{fmt(p.slMcapUsd)}</span> ✎
                      </button>
                    )}
                  </td>
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
      {msg.ok && <p className="msg-ok" style={{ padding: "0 14px 12px" }}>{msg.ok} {msg.sig && <a href={explorer("tx", msg.sig)} target="_blank" rel="noreferrer">View transaction</a>}</p>}
      {msg.err && <p className="msg-err" role="alert" style={{ padding: "0 14px 12px" }}>{msg.err}</p>}
      <p className="note" style={{ padding: "0 14px 12px" }}>PnL shown at the current spot price. The actual payout uses the averaged price and includes price impact and the close fee.</p>
    </div>
  );
}

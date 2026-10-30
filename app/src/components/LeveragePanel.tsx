"use client";

import { useState } from "react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { explorer } from "@/lib/config";
import { leverageError, openPositionIx } from "@/lib/leverage";
import { TEST_HOLD_SECS, tierFor } from "@/lib/tiers";
import { price, sol } from "@/lib/format";
import type { Coin } from "@/lib/coins";
import type { LeverageState } from "@/lib/useLeverage";

const DEGEN_MIN_POOL = { real: 20, test: 0.5 };
const DEGEN_MIN_AGE = { real: 1800, test: 60 };

export function LeveragePanel({ coin, lev, onDone }: { coin: Coin; lev: LeverageState; onDone: () => void }) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { setVisible } = useWalletModal();
  const [long, setLong] = useState(true);
  const [margin, setMargin] = useState("0.1");
  const [leverage, setLeverage] = useState(2);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; err?: string; sig?: string }>({});

  if (!lev.loaded) return <p className="note">Loading long/short…</p>;
  if (!lev.market || !lev.market.enabled) {
    return (
      <p className="note">
        Long/short isn&apos;t enabled for ${coin.symbol} yet. It unlocks once the coin has enough liquidity and its price history is being tracked.
      </p>
    );
  }

  const test = lev.global?.testBuild ?? false;
  const solUsd = lev.global?.solUsd || 0;
  const tier = tierFor(coin.mcapUsd);
  const lev2 = Math.min(leverage, tier.leverage);
  const poolSol = lev.market.poolSol;
  const marginSol = Math.max(0, Number(margin) || 0);
  const size = marginSol * lev2;

  // Same caps as the program: smaller of % of pool SOL and 5% of free vault.
  const cap = Math.min((poolSol * tier.oiCapPctOfPool) / 100, lev.vaultFree * 0.05);
  const used = long ? lev.market.oiLong : lev.market.oiShort;
  const left = Math.max(0, cap - used);

  const degenLocked =
    tier.id === 0 &&
    (poolSol < (test ? DEGEN_MIN_POOL.test : DEGEN_MIN_POOL.real) ||
      Date.now() / 1000 - lev.market.launchedAt < (test ? DEGEN_MIN_AGE.test : DEGEN_MIN_AGE.real));

  // Virtual price impact, as the program charges it.
  const spot = coin.priceSol;
  const entry = long ? spot * (1 + size / poolSol) : spot / (1 + size / poolSol);
  const liq = long ? entry * (1 - 0.9 / lev2) : entry * (1 + 0.9 / lev2);
  const fee = (size * tier.feePct) / 100;
  const hold = test ? TEST_HOLD_SECS : tier.minHoldSecs;

  const problem =
    lev.global?.paused ? "New positions are paused right now." :
    degenLocked ? `New coins unlock long/short after ${test ? "1 minute" : "30 minutes"} and ${test ? DEGEN_MIN_POOL.test : DEGEN_MIN_POOL.real} SOL of liquidity.` :
    marginSol > tier.maxMarginSol ? `Max margin on this coin is ${tier.maxMarginSol} SOL.` :
    size > left ? `Only ${left.toFixed(3)} SOL of ${long ? "long" : "short"} capacity is left on this coin.` :
    "";

  async function open() {
    if (!publicKey) return setVisible(true);
    setMsg({});
    if (!(marginSol > 0)) return setMsg({ err: "Enter a margin amount" });
    if (problem) return setMsg({ err: problem });
    setBusy(true);
    try {
      const tx = new Transaction().add(
        openPositionIx(publicKey, new PublicKey(coin.mint), BigInt(Date.now()), long, BigInt(Math.round(marginSol * 1e9)), lev2),
      );
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");
      setMsg({ ok: `Opened ${long ? "long" : "short"} ${lev2}x.`, sig });
      onDone();
    } catch (e) {
      setMsg({ err: leverageError(e) });
    } finally {
      setBusy(false);
    }
  }

  const usdPrice = (p: number) => price(p * solUsd);
  const presets = ["0.05", "0.1", "0.25", String(tier.maxMarginSol)];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="chips" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }} role="group" aria-label="Direction">
        <button type="button" className={`chip long${long ? " on" : ""}`} aria-pressed={long} onClick={() => setLong(true)} style={{ fontFamily: "var(--sans)", fontSize: 13 }}>Long</button>
        <button type="button" className={`chip short${!long ? " on" : ""}`} aria-pressed={!long} onClick={() => setLong(false)} style={{ fontFamily: "var(--sans)", fontSize: 13 }}>Short</button>
      </div>

      <label className="field">
        <span>Margin (SOL) · max {tier.maxMarginSol} on this coin</span>
        <input className="input" inputMode="decimal" value={margin} onChange={(e) => setMargin(e.target.value)} />
      </label>
      <div className="chips" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
        {presets.map((p, i) => <button key={p + i} type="button" className="chip" onClick={() => setMargin(p)}>{i === 3 ? "Max" : p}</button>)}
      </div>

      <div className="field">
        <span>Leverage · this coin allows up to {tier.leverage}x ({tier.label})</span>
        <div className="chips" style={{ gridTemplateColumns: `repeat(${Math.min(tier.leverage, 5)}, minmax(0, 1fr))` }} role="group" aria-label="Leverage">
          {[1, 2, 3, 5, 10].filter((l) => l <= tier.leverage).map((l) => (
            <button key={l} type="button" className={`chip${lev2 === l ? " on" : ""}`} aria-pressed={lev2 === l} onClick={() => setLeverage(l)}>{l}x</button>
          ))}
        </div>
      </div>

      <div className="rows">
        <div><span>Position size</span><span>{sol(size)}</span></div>
        <div><span>Entry price (incl. impact)</span><span>{usdPrice(entry)}</span></div>
        <div><span>Liquidation price</span><span className="warn">{usdPrice(liq)}</span></div>
        <div><span>Open fee ({tier.feePct}%)</span><span>{sol(fee, 4)}</span></div>
        <div><span>Max profit ({tier.profitCapX}x margin)</span><span>{sol(marginSol * tier.profitCapX)}</span></div>
        <div><span>{long ? "Long" : "Short"} capacity left</span><span>{sol(left)}</span></div>
      </div>

      <button type="button" className={`cta ${long ? "long" : "short"}`} disabled={busy} onClick={open}>
        {!publicKey ? "Connect wallet" : busy ? "Confirm in wallet…" : `Open ${long ? "Long" : "Short"} ${lev2}x · ${sol(size)}`}
      </button>
      {problem && publicKey && <p className="msg-err" role="status">{problem}</p>}
      {msg.ok && <p className="msg-ok">{msg.ok} <a href={explorer("tx", msg.sig!)} target="_blank" rel="noreferrer">View transaction</a></p>}
      {msg.err && <p className="msg-err" role="alert">{msg.err}</p>}
      <p className="note">
        Wins are paid in SOL from the long/short vault. Your position never buys or sells the coin, so it doesn&apos;t move the chart.
        Minimum hold {hold} s. Liquidated at 90% loss.
      </p>
    </div>
  );
}

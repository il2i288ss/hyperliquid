"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import BN from "bn.js";
import { buildSwapTx } from "@/lib/meteora";
import { TIERS } from "@/lib/tiers";

type Mode = "buy" | "sell" | "leverage";

export default function CoinPage() {
  const { mint } = useParams<{ mint: string }>();
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { setVisible } = useWalletModal();

  const [mode, setMode] = useState<Mode>("buy");
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState("5");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});

  let mintKey: PublicKey | null = null;
  try { mintKey = new PublicKey(mint); } catch { /* invalid */ }
  if (!mintKey) return <main className="page"><p className="err">Invalid coin address.</p></main>;

  async function trade() {
    if (!publicKey) return setVisible(true);
    setBusy(true);
    setMsg({});
    try {
      const n = Number(amount);
      if (!(n > 0)) throw new Error("Enter an amount");
      // buy: amount in SOL (9 decimals); sell: amount in tokens (6 decimals)
      const amountIn = new BN(Math.round(n * (mode === "buy" ? 1e9 : 1e6)));
      const { tx } = await buildSwapTx({
        connection,
        owner: publicKey,
        mint: mintKey!,
        buy: mode === "buy",
        amountIn,
        slippageBps: Math.round(Number(slippage) * 100),
      });
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");
      setMsg({ ok: `Done: ${sig}` });
    } catch (e) {
      setMsg({ err: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <div className="grid">
        <section>
          <div className="panel" style={{ marginBottom: 16 }}>
            <h2 className="mono">{mintKey.toBase58()}</h2>
            <p className="note">Live price, market cap and holders come from the indexer (see README, phase 2).</p>
          </div>
          <div className="panel chart">Chart (TradingView lightweight-charts, fed by the indexer)</div>
        </section>

        <aside className="panel">
          <div className="tabs">
            {(["buy", "sell", "leverage"] as Mode[]).map((m) => (
              <button key={m} className={`tab ${mode === m ? "on" : ""}`} onClick={() => setMode(m)}>
                {m === "leverage" ? "Long / Short" : m[0].toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>

          {mode !== "leverage" ? (
            <>
              <label className="label">{mode === "buy" ? "Pay (SOL)" : "Sell (tokens)"}</label>
              <input className="input mono" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.0" />
              <label className="label">Max slippage %</label>
              <input className="input mono" inputMode="decimal" value={slippage} onChange={(e) => setSlippage(e.target.value)} />
              <p className="note">
                3% tax on every trade. Your slippage limit also blocks the 90% launch-block tax, so you can never pay it by accident.
              </p>
              <button className={`btn ${mode === "buy" ? "long" : "short"}`} disabled={busy} onClick={trade} style={{ marginTop: 12 }}>
                {!publicKey ? "Connect wallet" : busy ? "Confirm in wallet…" : mode === "buy" ? "Buy" : "Sell"}
              </button>
            </>
          ) : (
            <>
              <p className="note">Long or short this coin with SOL. Wins are paid in SOL from the vault and never move the chart.</p>
              <div style={{ marginTop: 10 }}>
                {TIERS.map((t) => (
                  <div className="kv" key={t.id}>
                    <span>{t.label}</span>
                    <b className="mono">{t.leverage}x · max {t.maxMarginSol} SOL</b>
                  </div>
                ))}
              </div>
              <button className="btn" disabled style={{ marginTop: 12 }}>Coming in phase 2</button>
            </>
          )}
          {msg.ok && <p className="ok">{msg.ok}</p>}
          {msg.err && <p className="err">{msg.err}</p>}
        </aside>
      </div>
    </main>
  );
}

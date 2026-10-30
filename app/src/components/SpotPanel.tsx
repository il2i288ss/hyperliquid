"use client";

import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import BN from "bn.js";
import { buildSwapTx } from "@/lib/meteora";
import { explorer } from "@/lib/config";
import type { Coin } from "@/lib/coins";
import { txError } from "@/lib/txError";

export function SpotPanel({ coin, side, onDone }: { coin: Coin; side: "buy" | "sell"; onDone: () => void }) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { setVisible } = useWalletModal();
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState("5");
  const [balance, setBalance] = useState<number | null>(null); // whole tokens
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; err?: string; sig?: string }>({});

  useEffect(() => {
    setAmount("");
    setMsg({});
  }, [side]);

  useEffect(() => {
    if (!publicKey) return setBalance(null);
    const ata = getAssociatedTokenAddressSync(new PublicKey(coin.mint), publicKey);
    connection.getTokenAccountBalance(ata).then(
      (b) => setBalance(Number(b.value.uiAmount ?? 0)),
      () => setBalance(0),
    );
  }, [connection, publicKey, coin.mint, msg.sig]);

  const buy = side === "buy";
  const presets = buy ? ["0.1", "0.5", "1", "2"] : ["25%", "50%", "75%", "100%"];
  const pick = (p: string) => {
    if (buy) return setAmount(p);
    if (balance) setAmount(String(Math.floor((balance * parseInt(p)) / 100)));
  };
  const n = Number(amount);
  const estTokens = buy && n > 0 ? (n * 0.9625) / coin.priceSol : 0;
  const estSol = !buy && n > 0 ? n * coin.priceSol * 0.9625 : 0;

  async function trade() {
    if (!publicKey) return setVisible(true);
    setMsg({});
    if (!(n > 0)) return setMsg({ err: "Enter an amount" });
    setBusy(true);
    try {
      const amountIn = new BN(Math.round(n * (buy ? 1e9 : 1e6)));
      const { tx } = await buildSwapTx({
        connection, owner: publicKey, mint: new PublicKey(coin.mint), buy, amountIn,
        slippageBps: Math.round(Number(slippage) * 100),
      });
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");
      setMsg({ ok: buy ? "Bought." : "Sold.", sig });
      setAmount("");
      onDone();
    } catch (e) {
      setMsg({ err: txError(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label className="field">
        <span>{buy ? "You pay (SOL)" : `You sell ($${coin.symbol})`}{!buy && balance != null && <> · balance <span className="mono">{balance.toLocaleString()}</span></>}</span>
        <input className="input" inputMode="decimal" placeholder="0.0" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <div className="chips" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
        {presets.map((p) => <button key={p} type="button" className="chip" onClick={() => pick(p)}>{p}</button>)}
      </div>
      <div className="rows">
        <div><span>You get (est.)</span><span>{buy ? `${estTokens ? Math.floor(estTokens).toLocaleString() : "—"} $${coin.symbol}` : `${estSol ? estSol.toFixed(4) : "—"} SOL`}</span></div>
        <div><span>Trade tax</span><span>3.75% (1% to holders)</span></div>
        <div>
          <span><label htmlFor="slip">Max slippage %</label></span>
          <span><input id="slip" className="input" style={{ width: 70, minHeight: 32, padding: "4px 8px", fontSize: 12 }} inputMode="decimal" value={slippage} onChange={(e) => setSlippage(e.target.value)} /></span>
        </div>
      </div>
      <button type="button" className={`cta ${buy ? "long" : "short"}`} disabled={busy} onClick={trade}>
        {!publicKey ? "Connect wallet" : busy ? "Confirm in wallet…" : buy ? `Buy $${coin.symbol}` : `Sell $${coin.symbol}`}
      </button>
      {msg.ok && <p className="msg-ok">{msg.ok} <a href={explorer("tx", msg.sig!)} target="_blank" rel="noreferrer">View transaction</a></p>}
      {msg.err && <p className="msg-err" role="alert">{msg.err}</p>}
      <p className="note">Your slippage limit also protects you from ever paying the 90% launch-block tax by accident.</p>
    </div>
  );
}

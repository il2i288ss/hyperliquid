"use client";

import { useCallback, useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import BN from "bn.js";
import { MAIN_DBC_CONFIG, explorer } from "@/lib/config";
import { client } from "@/lib/meteora";
import { txError } from "@/lib/txError";

const U64_MAX = new BN("18446744073709551615");

type Row = { pool: PublicKey; mint: string; unclaimedSol: number };

/** The launcher's main coins and the trading fees waiting for them, with a claim button. */
export function MainCoinFees() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; err?: string; sig?: string }>({});

  const load = useCallback(async () => {
    if (!publicKey || !MAIN_DBC_CONFIG) return;
    const dbc = client(connection);
    const pools = (await dbc.state.getPoolsByConfig(MAIN_DBC_CONFIG)).filter((p) =>
      (p.account.poolState.creator as PublicKey).equals(publicKey),
    );
    const out: Row[] = [];
    for (const p of pools) {
      const fees = await dbc.state.getPoolFeeMetrics(p.publicKey);
      out.push({
        pool: p.publicKey,
        mint: (p.account.poolState.baseMint as PublicKey).toBase58(),
        unclaimedSol: Number(fees.current.creatorQuoteFee.toString()) / 1e9,
      });
    }
    setRows(out);
  }, [connection, publicKey]);

  useEffect(() => {
    load().catch(() => setRows([]));
    const t = setInterval(() => load().catch(() => {}), 20_000);
    return () => clearInterval(t);
  }, [load]);

  async function claim(r: Row) {
    if (!publicKey) return;
    setBusy(r.pool.toBase58());
    setMsg({});
    try {
      const tx = await client(connection).creator.claimCreatorTradingFee({
        creator: publicKey,
        payer: publicKey,
        pool: r.pool,
        maxBaseAmount: U64_MAX,
        maxQuoteAmount: U64_MAX,
      });
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");
      setMsg({ ok: `Claimed ${r.unclaimedSol.toFixed(4)} SOL.`, sig });
      load().catch(() => {});
    } catch (e) {
      setMsg({ err: txError(e) });
    } finally {
      setBusy("");
    }
  }

  if (!publicKey || !rows) return null;
  return (
    <section className="panel pad launch-box" aria-label="Your main coin fees">
      <h2>Your main coin fees</h2>
      {rows.length === 0 ? (
        <p className="note">No main coin launched from this wallet yet.</p>
      ) : (
        rows.map((r) => (
          <div key={r.pool.toBase58()} className="rows">
            <div><span>Coin</span><span><a href={explorer("address", r.mint)} target="_blank" rel="noreferrer">{r.mint.slice(0, 4)}…{r.mint.slice(-4)}</a></span></div>
            <div><span>Fees ready to claim</span><span>{r.unclaimedSol.toFixed(4)} SOL</span></div>
            <button type="button" className="cta" style={{ marginTop: 8 }} disabled={!!busy || r.unclaimedSol <= 0} onClick={() => claim(r)}>
              {busy === r.pool.toBase58() ? "Confirm in wallet…" : "Claim fees"}
            </button>
          </div>
        ))
      )}
      {msg.ok && <p className="msg-ok">{msg.ok} <a href={explorer("tx", msg.sig!)} target="_blank" rel="noreferrer">View transaction</a></p>}
      {msg.err && <p className="msg-err" role="alert">{msg.err}</p>}
      <p className="note">The main coin isn&apos;t listed on the launchpad. Its 3% tax builds up in the pool and is yours to claim here anytime.</p>
    </section>
  );
}

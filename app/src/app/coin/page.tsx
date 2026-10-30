"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function FindCoin() {
  const [mint, setMint] = useState("");
  const router = useRouter();
  return (
    <main className="page" style={{ maxWidth: 520 }}>
      <div className="panel">
        <h2>Trade a coin</h2>
        <label className="label">Coin address</label>
        <input className="input mono" value={mint} onChange={(e) => setMint(e.target.value.trim())} />
        <button className="btn" style={{ marginTop: 12 }} disabled={!mint} onClick={() => router.push(`/coin/${mint}`)}>
          Open
        </button>
        <p className="note">A live list of new and trending coins comes with the indexer in phase 2.</p>
      </div>
    </main>
  );
}

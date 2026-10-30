"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { buildLaunchTx, LAUNCH_FEE_SOL } from "@/lib/meteora";

export default function LaunchPage() {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const { setVisible } = useWalletModal();
  const router = useRouter();

  const [form, setForm] = useState({ name: "", symbol: "", description: "", website: "", twitter: "", telegram: "" });
  const [image, setImage] = useState<File | null>(null);
  const [firstBuy, setFirstBuy] = useState("0");
  const [status, setStatus] = useState<"" | "uploading" | "signing" | "sending">("");
  const [error, setError] = useState("");

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const buy = Math.max(0, Number(firstBuy) || 0);
  const ready = form.name.trim() && form.symbol.trim() && image && !status;

  async function launch() {
    if (!publicKey || !signTransaction) return setVisible(true);
    setError("");
    try {
      setStatus("uploading");
      const body = new FormData();
      Object.entries(form).forEach(([k, v]) => body.append(k, v));
      body.append("image", image!);
      const res = await fetch("/api/metadata", { method: "POST", body });
      const meta = await res.json();
      if (!res.ok) throw new Error(meta.error ?? "Upload failed");

      setStatus("signing");
      const { tx, mint } = await buildLaunchTx({
        connection,
        creator: publicKey,
        name: form.name.trim(),
        symbol: form.symbol.trim().toUpperCase(),
        uri: meta.uri,
        firstBuySol: buy,
      });
      const signed = await signTransaction(tx);

      setStatus("sending");
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, "confirmed");
      router.push(`/coin/${mint.toBase58()}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStatus("");
    }
  }

  const label = { "": "Launch coin", uploading: "Uploading image…", signing: "Approve in wallet…", sending: "Launching…" }[status];

  return (
    <main className="page">
      <div className="grid">
        <section className="panel">
          <h2>Launch a coin</h2>
          <div className="row">
            <div>
              <label className="label">Name</label>
              <input className="input" maxLength={32} value={form.name} onChange={set("name")} placeholder="Moon Cat" />
            </div>
            <div>
              <label className="label">Ticker</label>
              <input className="input" maxLength={10} value={form.symbol} onChange={set("symbol")} placeholder="MCAT" />
            </div>
          </div>

          <label className="label">Description</label>
          <textarea className="textarea" maxLength={500} value={form.description} onChange={set("description")} />

          <label className="label">Image (max 2 MB)</label>
          <div className="row" style={{ alignItems: "center" }}>
            {image ? <img className="preview" src={URL.createObjectURL(image)} alt="" style={{ flex: "0 0 72px" }} /> : null}
            <input className="input" type="file" accept="image/*" onChange={(e) => setImage(e.target.files?.[0] ?? null)} />
          </div>

          <div className="row">
            <div>
              <label className="label">Website</label>
              <input className="input" value={form.website} onChange={set("website")} />
            </div>
            <div>
              <label className="label">X / Twitter</label>
              <input className="input" value={form.twitter} onChange={set("twitter")} />
            </div>
            <div>
              <label className="label">Telegram</label>
              <input className="input" value={form.telegram} onChange={set("telegram")} />
            </div>
          </div>
        </section>

        <aside className="panel">
          <h2>Launch</h2>
          <label className="label">Your first buy (SOL, optional)</label>
          <input className="input mono" inputMode="decimal" value={firstBuy} onChange={(e) => setFirstBuy(e.target.value)} />
          <p className="note">Your first buy happens in the launch transaction, so snipers can&apos;t get in ahead of you.</p>

          <div style={{ margin: "14px 0" }}>
            <div className="kv"><span>Launch fee</span><b className="mono">{LAUNCH_FEE_SOL} SOL</b></div>
            <div className="kv"><span>First buy</span><b className="mono">{buy} SOL</b></div>
            <div className="kv"><span>Network + rent (approx.)</span><b className="mono">~0.025 SOL</b></div>
            <div className="kv"><span>Total</span><b className="mono">~{(LAUNCH_FEE_SOL + buy + 0.025).toFixed(3)} SOL</b></div>
          </div>

          <button className="btn" disabled={!!publicKey && !ready} onClick={launch}>
            {publicKey ? label : "Connect wallet"}
          </button>
          {error && <p className="err">{error}</p>}

          <p className="note">
            Every trade pays a 3% tax: 1% to holders in SOL, 1.9% to the long/short vault, 0.1% to the platform.
            Buys in the launch block pay a <span className="warn">90% anti-sniper tax</span>.
          </p>
        </aside>
      </div>
    </main>
  );
}

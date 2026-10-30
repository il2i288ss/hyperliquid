"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { buildLaunchTx } from "@/lib/meteora";
import { LAUNCH_FEE_SOL, LAUNCH_RENT_SOL } from "@/lib/config";
import { txError } from "@/lib/txError";

type Status = "" | "uploading" | "signing" | "sending";
const LABEL: Record<Status, string> = {
  "": "Launch coin",
  uploading: "Uploading image…",
  signing: "Approve in your wallet…",
  sending: "Launching…",
};

export default function LaunchPage() {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const { setVisible } = useWalletModal();
  const router = useRouter();

  const [form, setForm] = useState({ name: "", symbol: "", description: "", website: "", twitter: "", telegram: "" });
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [firstBuy, setFirstBuy] = useState("0");
  const [status, setStatus] = useState<Status>("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!image) return setPreview("");
    const url = URL.createObjectURL(image);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const buy = Math.max(0, Number(firstBuy) || 0);
  const missing = !form.name.trim() ? "Add a name" : !form.symbol.trim() ? "Add a ticker" : !image ? "Add an image" : "";

  async function launch() {
    if (!publicKey || !signTransaction) return setVisible(true);
    if (missing) return setError(missing);
    setError("");
    const needed = (LAUNCH_FEE_SOL + buy + LAUNCH_RENT_SOL) * 1e9;
    if ((await connection.getBalance(publicKey)) < needed) {
      return setError(txError(new Error("insufficient funds")));
    }
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
      setError(txError(e));
    } finally {
      setStatus("");
    }
  }

  return (
    <main className="page">
      <div className="split">
        <section className="main panel pad" style={{ gap: 14 }}>
          <h2>Launch a coin</h2>
          <div className="split" style={{ gap: 12 }}>
            <label className="field" style={{ flex: "2 1 240px" }}>
              <span>Name</span>
              <input className="input text" maxLength={32} value={form.name} onChange={set("name")} placeholder="Moon Cat" />
            </label>
            <label className="field" style={{ flex: "1 1 140px" }}>
              <span>Ticker</span>
              <input className="input text" maxLength={10} value={form.symbol} onChange={set("symbol")} placeholder="MCAT" />
            </label>
          </div>
          <label className="field">
            <span>Description</span>
            <textarea className="input text" maxLength={500} value={form.description} onChange={set("description")} />
          </label>
          <div className="field">
            <span>Image (max 2 MB)</span>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {preview && <img src={preview} alt="Token image preview" width={64} height={64} style={{ borderRadius: 10, objectFit: "cover" }} />}
              <label className="btn" style={{ cursor: "pointer" }}>
                {image ? "Change image" : "Choose image"}
                <input type="file" accept="image/*" className="sr" onChange={(e) => setImage(e.target.files?.[0] ?? null)} />
              </label>
              {image && <span className="muted">{image.name}</span>}
            </div>
          </div>
          <div className="split" style={{ gap: 12 }}>
            <label className="field" style={{ flex: "1 1 180px" }}><span>Website</span><input className="input text" value={form.website} onChange={set("website")} placeholder="https://" /></label>
            <label className="field" style={{ flex: "1 1 180px" }}><span>X / Twitter</span><input className="input text" value={form.twitter} onChange={set("twitter")} placeholder="https://x.com/" /></label>
            <label className="field" style={{ flex: "1 1 180px" }}><span>Telegram</span><input className="input text" value={form.telegram} onChange={set("telegram")} placeholder="https://t.me/" /></label>
          </div>
        </section>

        <aside className="side">
          <section className="panel pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2>Launch</h2>
            <label className="field">
              <span>Your first buy (SOL, optional)</span>
              <input className="input" inputMode="decimal" value={firstBuy} onChange={(e) => setFirstBuy(e.target.value)} />
            </label>
            <p className="note">Your first buy lands in the launch transaction, so snipers can&apos;t get in ahead of you. It pays the normal 3.75% fee, not the 90% sniper tax.</p>
            <div className="rows">
              <div><span>Launch fee</span><span>{LAUNCH_FEE_SOL} SOL</span></div>
              <div><span>First buy</span><span>{buy} SOL</span></div>
              <div><span>Network + rent (approx.)</span><span>~{LAUNCH_RENT_SOL} SOL</span></div>
              <div><span>Total</span><span>~{(LAUNCH_FEE_SOL + buy + LAUNCH_RENT_SOL).toFixed(3)} SOL</span></div>
            </div>
            <button type="button" className="cta" disabled={!!status} onClick={launch}>
              {publicKey ? LABEL[status] : "Connect wallet"}
            </button>
            {error && <p className="msg-err" role="alert">{error}</p>}
            <p className="note">
              Every trade pays 3%: 1% to holders in SOL, 1.9% to the long/short vault, 0.1% to the platform.
              Buys in the launch block pay a <span className="warn">90% anti-sniper tax</span>.
            </p>
          </section>
        </aside>
      </div>
    </main>
  );
}

"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { buildLaunchTx } from "@/lib/meteora";
import { LAUNCH_FEE_SOL, LAUNCH_RENT_SOL, MAIN_DBC_CONFIG, MAIN_LAUNCHER, explorer } from "@/lib/config";
import { MainCoinFees } from "@/components/MainCoinFees";
import { txError } from "@/lib/txError";

type Status = "" | "uploading" | "signing" | "sending";
const LABEL: Record<Status, string> = {
  "": "Launch coin",
  uploading: "Uploading image…",
  signing: "Approve in your wallet…",
  sending: "Launching…",
};

export default function LaunchPageRoute() {
  return (
    <Suspense fallback={null}>
      <LaunchPage />
    </Suspense>
  );
}

function LaunchPage() {
  const isMain = useSearchParams().get("main") === "1" && Boolean(MAIN_DBC_CONFIG);
  const launchFee = isMain ? 0 : LAUNCH_FEE_SOL;
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const { setVisible } = useWalletModal();
  const router = useRouter();

  const [form, setForm] = useState({ name: "", symbol: "", description: "", website: "", twitter: "", telegram: "", youtube: "" });
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [firstBuy, setFirstBuy] = useState("0");
  const [status, setStatus] = useState<Status>("");
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ mint: string; sig: string } | null>(null);

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

  const notLauncher = isMain && Boolean(publicKey) && publicKey!.toBase58() !== MAIN_LAUNCHER;

  async function launch() {
    if (!publicKey || !signTransaction) return setVisible(true);
    if (notLauncher) return setError("Only the platform wallet can launch the main coin.");
    if (missing) return setError(missing);
    setError("");
    const needed = (launchFee + buy + LAUNCH_RENT_SOL) * 1e9;
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
        config: isMain ? MAIN_DBC_CONFIG! : undefined,
      });
      const signed = await signTransaction(tx);

      setStatus("sending");
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, "confirmed");
      if (isMain) setDone({ mint: mint.toBase58(), sig });
      else router.push(`/coin/${mint.toBase58()}`);
    } catch (e) {
      setError(txError(e));
    } finally {
      setStatus("");
    }
  }

  const sym = form.symbol.trim().toUpperCase() || "TICKER";
  return (
    <main className="page launch-page">
      <header className="page-title">
        <h1>{isMain ? "Launch the main coin" : "Launch a coin"}</h1>
        <p>{isMain
          ? "The platform's own coin. 3% tax, all of it to the wallet that launches it. No launch fee, no long / short, and it isn't listed on the launchpad"
          : "It goes live in one transaction. Holders earn SOL from the first trade, and the coin gets its own long and short market once it has liquidity"}</p>
      </header>
      <div className="coin-grid">
        <section className="panel pad form-panel" aria-label="Coin details">
          <div className="form-row">
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
            <textarea className="input text" maxLength={500} value={form.description} onChange={set("description")} placeholder="What is this coin about" />
          </label>
          <div className="field">
            <span>Image <span className="muted">· up to 2 MB</span></span>
            <label className="drop">
              {preview ? <img src={preview} alt="Token image preview" width={64} height={64} /> : <span className="drop-empty" aria-hidden="true">+</span>}
              <span className="drop-text">
                <b>{image ? "Change image" : "Choose an image"}</b>
                <span className="muted">{image ? image.name : "PNG, JPG, GIF or WebP. Square looks best"}</span>
              </span>
              <input type="file" accept="image/*" className="sr" onChange={(e) => setImage(e.target.files?.[0] ?? null)} />
            </label>
          </div>
          <div className="field">
            <span>Links <span className="muted">· optional</span></span>
            <div className="form-grid">
              <label className="field"><span className="sr">Website</span><input className="input text" value={form.website} onChange={set("website")} placeholder="Website  https://" /></label>
              <label className="field"><span className="sr">X</span><input className="input text" value={form.twitter} onChange={set("twitter")} placeholder="X  https://x.com/" /></label>
              <label className="field"><span className="sr">Telegram</span><input className="input text" value={form.telegram} onChange={set("telegram")} placeholder="Telegram  https://t.me/" /></label>
              <label className="field"><span className="sr">YouTube</span><input className="input text" value={form.youtube} onChange={set("youtube")} placeholder="YouTube  https://youtube.com/" /></label>
            </div>
          </div>
        </section>

        <aside className="coin-side">
          <section className="panel pad launch-box" aria-label="Launch">
            <div className="preview-row" aria-label="Preview">
              <div className="avatar" style={{ width: 48, height: 48 }}>{preview ? <img src={preview} alt="" /> : <span className="avatar-letter">{(form.name[0] ?? "?").toUpperCase()}</span>}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <span style={{ fontWeight: 500, fontSize: 15 }}>{form.name.trim() || "Your coin"} <span className="muted" style={{ fontWeight: 400 }}>{sym}</span></span>
                <span className="mono muted" style={{ fontSize: 12 }}>Starts at MC ≈ 30 SOL</span>
              </div>
            </div>
            <label className="field">
              <span>Your first buy <span className="muted">· optional</span></span>
              <div className="input-unit">
                <input className="input" inputMode="decimal" value={firstBuy} onChange={(e) => setFirstBuy(e.target.value)} />
                <span>SOL</span>
              </div>
            </label>
            <p className="note">Your first buy lands in the launch transaction, so snipers can&apos;t get in ahead of you. It pays the normal fee, not the 90% sniper tax</p>
            <div className="rows">
              <div><span>Launch fee</span><span>{launchFee} SOL</span></div>
              <div><span>First buy</span><span>{buy} SOL</span></div>
              <div><span>Network and rent</span><span>≈ {LAUNCH_RENT_SOL} SOL</span></div>
              <div className="total"><span>Total</span><span>≈ {(launchFee + buy + LAUNCH_RENT_SOL).toFixed(3)} SOL</span></div>
            </div>
            <button type="button" className="cta" disabled={!!status || notLauncher} onClick={launch}>
              {publicKey ? LABEL[status] : "Connect wallet"}
            </button>
            {notLauncher && <p className="msg-err" role="alert">This wallet can&apos;t launch the main coin. Connect {MAIN_LAUNCHER.slice(0, 4)}…{MAIN_LAUNCHER.slice(-4)}.</p>}
            {error && <p className="msg-err" role="alert">{error}</p>}
            {done && <p className="msg-ok">Main coin launched. Address <span className="mono">{done.mint}</span> · <a href={explorer("tx", done.sig)} target="_blank" rel="noreferrer">View transaction</a></p>}
            <p className="note">
              {isMain
                ? "Every trade pays a 3% tax to your wallet, claimable below anytime. Buys in the launch block pay a 90% anti-sniper tax"
                : "Every trade pays 3%: 1% to holders in SOL every 15 minutes, 1.9% to the long and short vault, 0.1% to the platform. Buys in the launch block pay a 90% anti-sniper tax"}
            </p>
          </section>
          {isMain && !notLauncher && <MainCoinFees />}
        </aside>
      </div>
    </main>
  );
}

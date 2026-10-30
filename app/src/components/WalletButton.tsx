"use client";

import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { short } from "@/lib/format";

/** "Connect wallet" button; once connected, shows the address with a menu. */
export function WalletButton() {
  const { publicKey, wallet, connecting, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setMenu(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  if (!publicKey) {
    return (
      <button type="button" className="wallet-btn" onClick={() => setVisible(true)} disabled={connecting}>
        {connecting ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }
  const addr = publicKey.toBase58();
  return (
    <div className="wallet-menu" ref={box}>
      <button type="button" className="wallet-btn connected" onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-haspopup="menu">
        {wallet?.adapter.icon && <img src={wallet.adapter.icon} alt="" width={16} height={16} />}
        <span className="mono">{short(addr)}</span>
      </button>
      {menu && (
        <div className="wallet-dropdown" role="menu">
          <button type="button" role="menuitem" onClick={async () => { await navigator.clipboard.writeText(addr).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1200); }}>
            {copied ? "Copied" : "Copy address"}
          </button>
          <button type="button" role="menuitem" onClick={() => { setMenu(false); setVisible(true); }}>Change wallet</button>
          <button type="button" role="menuitem" onClick={() => { setMenu(false); disconnect().catch(() => {}); }}>Disconnect</button>
        </div>
      )}
    </div>
  );
}

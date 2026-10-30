"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { BRAND, NETWORK } from "@/lib/config";

// The wallet button reads window, so render it client-side only.
const WalletButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false },
);

/** Obverse mark: one coin, two sides (long mint, short red). */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2 A10 10 0 0 0 12 22 Z" fill="#50D2C1" />
      <path d="M12 2 A10 10 0 0 1 12 22 Z" fill="#ED7088" />
      <circle cx="12" cy="12" r="10" fill="none" stroke="#0F1A1F" strokeWidth="1.2" />
      <circle cx="12" cy="12" r="6.2" fill="none" stroke="#0F1A1F" strokeWidth="1.4" opacity=".55" />
      <path d="M12 2 V22" stroke="#0F1A1F" strokeWidth="1.6" />
    </svg>
  );
}

export function TopBar() {
  const path = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");
  const nav = [
    { href: "/", label: "Discover" },
    { href: "/launch", label: "Launch" },
    { href: "/docs", label: "Docs" },
  ];

  // Paste a coin address to jump straight to it.
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = q.trim();
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v)) router.push(`/coin/${v}`);
    else router.push(`/?q=${encodeURIComponent(v)}`);
  };

  return (
    <header className="topbar">
      <Link href="/" className="brand"><Logo /><span>{BRAND}</span></Link>
      <nav className="nav" aria-label="Main">
        {nav.map((n) => (
          <Link key={n.href} href={n.href} className={path === n.href ? "on" : ""}>{n.label}</Link>
        ))}
      </nav>
      <form className="search" role="search" onSubmit={submit}>
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="#869896" strokeWidth="2" /><path d="M20 20 L16 16" stroke="#869896" strokeWidth="2" strokeLinecap="round" /></svg>
        <label className="sr" htmlFor="search">Search coins</label>
        <input id="search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, ticker or paste an address" />
      </form>
      {NETWORK === "devnet" && <span className="netpill">DEVNET</span>}
      <WalletButton />
    </header>
  );
}

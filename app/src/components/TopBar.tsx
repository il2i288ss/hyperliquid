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

export function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <path d="M3 16 L9 6 L13 12 L19 4" fill="none" stroke="#8EA8FF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 19 H19" stroke="#F0566A" strokeWidth="2" strokeLinecap="round" />
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
    { href: "/guide", label: "How it works" },
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
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="#8B95A3" strokeWidth="2" /><path d="M20 20 L16 16" stroke="#8B95A3" strokeWidth="2" strokeLinecap="round" /></svg>
        <label className="sr" htmlFor="search">Search coins</label>
        <input id="search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, ticker or paste an address" />
      </form>
      {NETWORK === "devnet" && <span className="netpill">DEVNET</span>}
      <WalletButton />
    </header>
  );
}

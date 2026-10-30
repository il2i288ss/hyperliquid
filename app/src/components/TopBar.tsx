"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { BRAND, NETWORK } from "@/lib/config";
import { Icon, type IconName } from "./Icon";

// The wallet button reads window, so render it client-side only.
const WalletButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false },
);

export function TopBar() {
  const path = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");
  const nav = [
    { href: "/", label: "Discover", icon: "compass" },
    { href: "/launch", label: "Launch", icon: "rocket" },
    { href: "/docs", label: "Docs", icon: "book" },
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
      <Link href="/" className="brand" aria-label={`${BRAND} home`}><img src="/brand/wordmark.png" alt={BRAND} height={22} style={{ height: 22, width: "auto", display: "block" }} /></Link>
      <nav className="nav" aria-label="Main">
        {nav.map((n) => (
          <Link key={n.href} href={n.href} className={path === n.href ? "on" : ""}><Icon name={n.icon as IconName} size={15} />{n.label}</Link>
        ))}
      </nav>
      <form className="search" role="search" onSubmit={submit}>
        <span className="muted"><Icon name="search" size={15} /></span>
        <label className="sr" htmlFor="search">Search coins</label>
        <input id="search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, ticker or paste an address" />
      </form>
      {NETWORK === "devnet" && <span className="netpill">DEVNET</span>}
      <WalletButton />
    </header>
  );
}

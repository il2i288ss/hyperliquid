"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BRAND, NETWORK } from "@/lib/config";

// The wallet button reads window, so render it client-side only.
const WalletButton = dynamic(async () => (await import("./WalletButton")).WalletButton, { ssr: false });

/** Bold magnifier, matching the brand search icon. */
function SearchGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
      <circle cx="10" cy="10" r="6.4" />
      <path d="M15 15 20 20" />
    </svg>
  );
}

export function TopBar() {
  const path = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const nav = [
    { href: "/", label: "Discover" },
    { href: "/launch", label: "Launch" },
    { href: "/docs", label: "Docs" },
  ];

  // Press "/" anywhere to start searching.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      e.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (v: string) => {
    v = v.trim();
    if (!v) return;
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v)) router.push(`/coin/${v}`);
    else router.push(`/?q=${encodeURIComponent(v)}`);
  };
  const paste = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      setQ(text);
      go(text);
    } catch {
      input.current?.focus();
    }
  };

  // Paste a coin address to jump straight to it.
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    go(q);
  };

  return (
    <header className="topbar">
      <Link href="/" className="brand" aria-label={`${BRAND} home`}><img src="/brand/wordmark.png" alt={BRAND} height={22} style={{ height: 22, width: "auto", display: "block" }} /></Link>
      <nav className="nav" aria-label="Main">
        {nav.map((n) => (
          <Link key={n.href} href={n.href} className={path === n.href ? "on" : ""}>{n.label}</Link>
        ))}
      </nav>
      <form className="search" role="search" onSubmit={submit}>
        <span className="search-icon"><SearchGlyph /></span>
        <label className="sr" htmlFor="search">Search for token</label>
        <input ref={input} id="search" type="search" autoComplete="off" spellCheck={false} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search for token" />
        <button type="button" className="kbd-btn" onClick={paste}>Paste</button>
        <kbd className="kbd" title="Press / to search">/</kbd>
      </form>
      <div className="topbar-right">
        {NETWORK === "devnet" && <span className="netpill">DEVNET</span>}
        <WalletButton />
      </div>
    </header>
  );
}

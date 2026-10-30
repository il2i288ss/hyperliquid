"use client";

import Link from "next/link";
import dynamic from "next/dynamic";

// The wallet button reads window, so render it client-side only.
const WalletButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false },
);

export function TopBar() {
  return (
    <header className="topbar">
      <Link href="/" className="brand">LAUNCHPAD</Link>
      <nav className="nav">
        <Link href="/">Launch</Link>
        <Link href="/coin">Trade</Link>
      </nav>
      <WalletButton />
    </header>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { NETWORK } from "@/lib/config";

/**
 * On devnet, a connected wallet with no devnet SOL almost always means the
 * wallet is still on mainnet. Say so plainly instead of failing at signing.
 */
export function NetworkBanner() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    if (NETWORK !== "devnet" || !publicKey) return setEmpty(false);
    let alive = true;
    const check = () =>
      connection.getBalance(publicKey).then((b) => alive && setEmpty(b < 5_000_000), () => {});
    check();
    const t = setInterval(check, 15_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [connection, publicKey]);

  if (!empty) return null;
  return (
    <div role="status" style={{ background: "#1f1708", borderBottom: "1px solid #4a3a16", color: "var(--warn)", padding: "10px 20px", fontSize: 13, lineHeight: 1.5 }}>
      <b>This is the devnet test site and your wallet has no devnet SOL.</b>{" "}
      In Phantom: Settings → Developer Settings → Testnet Mode → <b>Solana Devnet</b>. Then get free test SOL at{" "}
      <a href="https://faucet.solana.com" target="_blank" rel="noreferrer">faucet.solana.com</a> for{" "}
      <span className="mono">{publicKey!.toBase58()}</span>. <a href="/docs">Docs</a>
    </div>
  );
}

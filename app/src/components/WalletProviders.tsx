"use client";

import { useMemo, type ReactNode } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { WalletConnectWalletAdapter } from "@solana/wallet-adapter-walletconnect";
import "@solana/wallet-adapter-react-ui/styles.css";

/**
 * Phantom + Solflare adapters, WalletConnect for mobile wallets, and every
 * Wallet Standard wallet (MetaMask's Solana support, Backpack, ...) is
 * detected automatically.
 */
export function WalletProviders({ children }: { children: ReactNode }) {
  const endpoint = process.env.NEXT_PUBLIC_RPC_URL!;
  const network =
    process.env.NEXT_PUBLIC_NETWORK === "mainnet-beta"
      ? WalletAdapterNetwork.Mainnet
      : WalletAdapterNetwork.Devnet;

  const wallets = useMemo(() => {
    const list: any[] = [new PhantomWalletAdapter(), new SolflareWalletAdapter()];
    const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID;
    if (projectId) {
      list.push(
        new WalletConnectWalletAdapter({
          network,
          options: {
            projectId,
            metadata: {
              name: "Launchpad",
              description: "Launch, trade, long and short memecoins",
              url: typeof window !== "undefined" ? window.location.origin : "",
              icons: [],
            },
          },
        }),
      );
    }
    return list;
  }, [network]);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

"use client";

import { useMemo, type ReactNode } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import {
  CoinbaseWalletAdapter,
  LedgerWalletAdapter,
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  TrustWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { installOnlyWallets } from "@/lib/walletLinks";
import { WalletConnectWalletAdapter } from "@solana/wallet-adapter-walletconnect";
import "@solana/wallet-adapter-react-ui/styles.css";
import { BRAND, NETWORK, RPC_URL } from "@/lib/config";

/**
 * Phantom, Solflare, Coinbase, Trust, Ledger, MetaMask and Backpack in the
 * list; WalletConnect for mobile wallets; and every other Wallet Standard
 * wallet installed in the browser is detected automatically.
 */
export function WalletProviders({ children }: { children: ReactNode }) {
  const endpoint = RPC_URL;
  const network = NETWORK === "mainnet-beta" ? WalletAdapterNetwork.Mainnet : WalletAdapterNetwork.Devnet;

  const wallets = useMemo(() => {
    const list: any[] = [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new CoinbaseWalletAdapter(),
      new TrustWalletAdapter(),
      new LedgerWalletAdapter(),
      // Shown with an install link until the extension is present; then the
      // real MetaMask / Backpack (Wallet Standard) takes over automatically.
      ...installOnlyWallets(),
    ];
    const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID;
    if (projectId) {
      list.push(
        new WalletConnectWalletAdapter({
          network,
          options: {
            projectId,
            metadata: {
              name: BRAND,
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

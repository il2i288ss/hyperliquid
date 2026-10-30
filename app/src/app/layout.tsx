import type { ReactNode } from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { WalletProviders } from "@/components/WalletProviders";
import { TopBar } from "@/components/TopBar";
import { NetworkBanner } from "@/components/NetworkBanner";
import { BRAND, TAGLINE } from "@/lib/config";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata = {
  title: { default: `${BRAND} · ${TAGLINE}`, template: `%s · ${BRAND}` },
  description: "Launch memecoins on Solana, earn SOL for holding, and long or short any coin. Every coin has two sides.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <WalletProviders>
          <TopBar />
          <NetworkBanner />
          {children}
        </WalletProviders>
      </body>
    </html>
  );
}

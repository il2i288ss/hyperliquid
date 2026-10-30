import type { ReactNode } from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { WalletProviders } from "@/components/WalletProviders";
import { TopBar } from "@/components/TopBar";
import { BRAND } from "@/lib/config";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata = {
  title: BRAND,
  description: "Launch memecoins, earn SOL for holding, and long or short any coin.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <WalletProviders>
          <TopBar />
          {children}
        </WalletProviders>
      </body>
    </html>
  );
}

import type { ReactNode } from "react";
import "./globals.css";
import { WalletProviders } from "@/components/WalletProviders";
import { TopBar } from "@/components/TopBar";

export const metadata = {
  title: "Launchpad",
  description: "Launch memecoins, earn SOL as a holder, and long or short them.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WalletProviders>
          <TopBar />
          {children}
        </WalletProviders>
      </body>
    </html>
  );
}

import Link from "next/link";
import { NETWORK } from "@/lib/config";

export const metadata = { title: "How it works" };

const card: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 8 };

export default function Guide() {
  const devnet = NETWORK === "devnet";
  return (
    <main className="page" style={{ maxWidth: 860, margin: "0 auto" }}>
      <h1 style={{ margin: "8px 0 0", fontSize: 22 }}>How it works</h1>

      {devnet && (
        <section className="panel pad" style={{ ...card, borderColor: "#4a3a16" }}>
          <h2 className="warn">You&apos;re on the test site (devnet)</h2>
          <p className="note" style={{ fontSize: 13 }}>Everything here uses free test SOL with no real value. To join:</p>
          <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
            <li>In Phantom: <b>Settings → Developer Settings → Testnet Mode → Solana Devnet</b>.</li>
            <li>Copy your wallet address, then get free SOL at <a href="https://faucet.solana.com" target="_blank" rel="noreferrer">faucet.solana.com</a> (choose devnet).</li>
            <li>Connect your wallet here (top right). That&apos;s it.</li>
          </ol>
        </section>
      )}

      <section className="panel pad" style={card}>
        <h2>Launch a coin</h2>
        <p className="note" style={{ fontSize: 13 }}>
          Go to <Link href="/launch">Launch</Link>, add a name, ticker and image, and approve in your wallet. It costs 0.03 SOL plus about
          0.025 SOL of network rent. Your optional first buy lands in the same transaction, so nobody can snipe ahead of you.
        </p>
      </section>

      <section className="panel pad" style={card}>
        <h2>Snipers pay 90%</h2>
        <p className="note" style={{ fontSize: 13 }}>
          Any buy in the same block as the launch pays a 90% fee. After that, every trade pays the normal fee. Bots that try to snipe
          end up funding holders and the long/short vault.
        </p>
      </section>

      <section className="panel pad" style={card}>
        <h2>Holders earn SOL</h2>
        <p className="note" style={{ fontSize: 13 }}>
          Every buy and sell pays 3.75%. Of that, 1% of the trade goes to the coin&apos;s holders in SOL, sent automatically every
          15 minutes. Your share is based on how much you held on average, so holding beats flipping. 1.9% goes to the long/short
          vault and 0.1% to the platform.
        </p>
      </section>

      <section className="panel pad" style={card}>
        <h2>Long or short any coin</h2>
        <p className="note" style={{ fontSize: 13 }}>
          On a coin&apos;s page, open <b>Long / Short</b>, pick a side, your SOL margin and leverage. Wins are paid in SOL from a vault
          that&apos;s locked on-chain; your position never buys or sells the coin, so it never moves the chart. Positions lose at most
          their margin and are closed automatically at a 90% loss.
        </p>
        <div className="table-wrap">
          <table className="data" style={{ minWidth: 420 }}>
            <thead><tr><th>Market cap</th><th>Max leverage</th><th>Max margin</th></tr></thead>
            <tbody>
              {[
                ["Under $100K (after 30 min and 20 SOL liquidity)", "2x", "0.5 SOL"],
                ["$100K–$500K", "3x", "4 SOL"],
                ["$500K–$1M", "5x", "5 SOL"],
                ["$1M–$5M", "10x", "5 SOL"],
                ["$5M–$10M", "10x", "8 SOL"],
                ["$10M+", "10x", "10 SOL"],
              ].map(([a, b, c]) => <tr key={a}><td style={{ fontFamily: "var(--sans)" }}>{a}</td><td>{b}</td><td>{c}</td></tr>)}
            </tbody>
          </table>
        </div>
        {devnet && <p className="note">On the test site, new coins unlock after 1 minute and 0.5 SOL of liquidity so you can try it right away.</p>}
      </section>
    </main>
  );
}

import Link from "next/link";
import { PublicKey } from "@solana/web3.js";
import { BRAND, DBC_CONFIG, LAUNCH_FEE_SOL, LEVERAGE_ENABLED, LEVERAGE_PROGRAM, NETWORK, explorer } from "@/lib/config";
import { TIERS } from "@/lib/tiers";
import { Icon } from "@/components/Icon";

export const metadata = { title: "Docs" };

const TREASURY = "GCHZXtrG8dF8n7KNgcxWGR4QpCBhf71ZBgrQDeKroUi6";
const VAULT = PublicKey.findProgramAddressSync([Buffer.from("vault")], LEVERAGE_PROGRAM)[0].toBase58();

const NAV: [string, [string, string][]][] = [
  ["Start", [["overview", "Overview"], ["wallet", "Connect a wallet"], ["launch", "Launch a coin"], ["trade", "Buy and sell"]]],
  ["Coins", [["fees", "Fees"], ["snipers", "Sniper protection"], ["curve", "Bonding curve & graduation"], ["rewards", "Holder rewards"], ["safety", "Token safety"]]],
  ["Long / short", [["ls", "How it works"], ["tiers", "Leverage tiers"], ["pnl", "Profit, loss & liquidation"], ["limits", "Limits & why"], ["vault", "The vault"]]],
  ["More", [["faq", "FAQ"], ["addresses", "Addresses"], ["risks", "Risks"]]],
];

const Addr = ({ a }: { a: string }) => (
  <a href={explorer("address", a)} target="_blank" rel="noreferrer"><code>{a}</code></a>
);

export default function Docs() {
  const devnet = NETWORK === "devnet";
  return (
    <div className="docs">
      <nav className="docs-nav" aria-label="Docs">
        {NAV.map(([group, items]) => (
          <div key={group} style={{ display: "contents" }}>
            <span className="group">{group}</span>
            {items.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
          </div>
        ))}
      </nav>

      <article className="docs-body">
        <h1 id="overview">How {BRAND} works</h1>
        <p className="lead">
          A Solana launchpad where anyone can launch a memecoin in one click, holders earn SOL from every trade, and anyone can
          go long or short any coin, with wins paid in SOL without moving the chart.
        </p>
        <div className="cards">
          <div className="card"><span className="ic"><Icon name="rocket" /></span><span className="big">{LAUNCH_FEE_SOL} SOL</span><span>to launch a coin</span></div>
          <div className="card"><span className="ic"><Icon name="coins" /></span><span className="big">1%</span><span>of every trade paid to holders in SOL, every 15 min</span></div>
          <div className="card"><span className="ic"><Icon name="shield" /></span><span className="big">90%</span><span>fee on snipers in the launch block</span></div>
          <div className="card"><span className="ic"><Icon name="layers" /></span><span className="big">up to 10x</span><span>long or short, paid from an on-chain vault</span></div>
        </div>
        {devnet && (
          <div className="callout warn">
            <b>You&apos;re on the test site (devnet).</b> Everything uses free test SOL. In Phantom: Settings → Developer Settings →
            Testnet Mode → Solana Devnet, then get free SOL at <a href="https://faucet.solana.com" target="_blank" rel="noreferrer">faucet.solana.com</a>.
          </div>
        )}

        <h2 id="wallet">Connect a wallet</h2>
        <p>
          Click <b>Select Wallet</b> in the top right. Phantom, Solflare, Backpack, MetaMask (Solana) and other Solana wallets work. Your wallet
          only signs transactions you approve; the site never holds your funds or keys.
        </p>

        <h2 id="launch">Launch a coin</h2>
        <ol>
          <li>Open <Link href="/launch">Launch</Link>, add a name, ticker, image and (optional) description and socials.</li>
          <li>Optionally set a <b>first buy</b>. It happens inside the launch transaction, so you&apos;re the first buyer and nobody can get in front of you.</li>
          <li>Approve in your wallet. Cost: <b>{LAUNCH_FEE_SOL} SOL</b> launch fee plus about <b>0.02 SOL</b> of Solana account rent, plus your first buy.</li>
        </ol>
        <p>Your coin appears on <Link href="/">Discover</Link> within seconds and is tradeable right away.</p>

        <h2 id="trade">Buy and sell</h2>
        <p>
          Open any coin and use the <b>Buy / Sell</b> panel. Trades go straight through the coin&apos;s Meteora pool on-chain. Set
          slippage if the price is moving fast. Everyone trades at the same price on the same curve; there&apos;s no order book and
          no hidden insiders.
        </p>

        <h2 id="fees">Fees</h2>
        <p>Every buy and sell pays <b>3.75%</b>, taken in SOL:</p>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Share of the trade</th><th>Goes to</th></tr></thead>
            <tbody>
              <tr><td><b>1%</b></td><td>The coin&apos;s holders, paid in SOL every 15 minutes</td></tr>
              <tr><td><b>1.9%</b></td><td>The long/short vault, which pays winning traders</td></tr>
              <tr><td><b>0.1%</b></td><td>Platform treasury</td></tr>
              <tr><td><b>0.75%</b></td><td>Meteora, the protocol that runs the pools</td></tr>
            </tbody>
          </table>
        </div>
        <p>The coin&apos;s creator doesn&apos;t take a cut of trading fees. The {LAUNCH_FEE_SOL} SOL launch fee goes to the platform.</p>

        <h2 id="snipers">Sniper protection</h2>
        <p>
          Bots try to buy in the very first block of a launch and dump on everyone else. Here, any buy in the launch block pays a
          <b> 90% fee</b>. From the next block (about 0.4 seconds later) the fee is back to normal. The creator&apos;s own first buy in
          the launch transaction pays the normal fee. Whatever snipers pay goes to holders and the vault.
        </p>

        <h2 id="curve">Bonding curve & graduation</h2>
        <p>
          Every coin starts on a bonding curve: the price rises as people buy and falls as they sell, with liquidity from day one
          and no one needed to seed a pool. Coins start at a market cap of about <b>30 SOL</b>.
        </p>
        <p>
          When the market cap reaches about <b>400 SOL</b>, the coin <b>graduates</b>: its liquidity moves into a regular Meteora
          pool and is <b>locked forever</b>, so it can never be pulled. The progress bar on Discover shows how close each coin is.
        </p>

        <h2 id="rewards">Holder rewards</h2>
        <p>
          1% of every trade on a coin goes to that coin&apos;s holders, <b>in SOL, sent to your wallet automatically every 15
          minutes</b>. There&apos;s nothing to claim.
        </p>
        <ul>
          <li>Your share = your <b>average</b> balance over the 15 minutes ÷ all holders&apos; average balance.</li>
          <li>Balances are checked every few minutes at random times, so buying right before a payout and selling after earns almost nothing. Holding is what pays.</li>
          <li>Very small amounts are saved up and paid once they&apos;re worth the network fee, so small holders aren&apos;t skipped.</li>
          <li>The pool itself and platform wallets are excluded, so all rewards go to real holders.</li>
        </ul>

        <h2 id="safety">Token safety</h2>
        <ul>
          <li><b>Fixed supply:</b> 1,000,000,000 tokens. Mint authority is revoked at launch; nobody can ever mint more.</li>
          <li><b>No freezing:</b> there is no freeze authority, so no one can lock your tokens.</li>
          <li><b>No dev allocation:</b> the creator only gets what they buy, at the same price as everyone else.</li>
          <li><b>Locked liquidity</b> after graduation.</li>
        </ul>

        <h2 id="ls">Long / short: how it works</h2>
        {!LEVERAGE_ENABLED && <div className="callout warn">Long/short is not live on this site yet.</div>}
        <p>
          On any eligible coin, open the <b>Long / Short</b> tab, pick a side, your SOL margin and leverage, and confirm.
        </p>
        <ul>
          <li><b>Long</b> profits when the price goes up. <b>Short</b> profits when it goes down.</li>
          <li>You trade with SOL only. You never need to hold the coin.</li>
          <li>
            <b>Positions don&apos;t touch the chart.</b> They&apos;re tracked by an on-chain program, not by buying or selling the coin. When
            you win, you&apos;re paid in SOL from the vault. A big winning short never dumps the coin on holders, and a long never
            needs to be sold into the pool.
          </li>
          <li>The price used is the coin&apos;s real pool price, averaged over the last minute (three minutes for coins under $100K), so a quick pump or dump can&apos;t be used to game an entry or exit.</li>
        </ul>
        <div className="flow">
          <div><b>1</b>Choose long or short</div>
          <div><b>2</b>Set margin + leverage</div>
          <div><b>3</b>Wait at least 1 min (3 min under $100K)</div>
          <div><b>4</b>Close: margin ± profit in SOL</div>
        </div>

        <h2 id="tiers">Leverage tiers</h2>
        <p>Larger coins are harder to move, so they get more leverage. The tier is set by the coin&apos;s average market cap.</p>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Market cap</th><th>Max leverage</th><th>Max margin</th><th>Max position</th><th>Fee (open + close)</th><th>Max profit</th></tr></thead>
            <tbody>
              {TIERS.map((t) => (
                <tr key={t.id}>
                  <td>{t.label}</td>
                  <td>{t.leverage}x</td>
                  <td>{t.maxMarginSol} SOL</td>
                  <td>{+(t.maxMarginSol * t.leverage).toFixed(2)} SOL</td>
                  <td>{t.feePct}% + {t.feePct}%</td>
                  <td>{t.profitCapX}× margin</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Coins under $100K unlock long/short once they&apos;re at least <b>30 minutes old</b> and have <b>20 SOL</b> of liquidity
          {devnet && " (on the test site: 1 minute and 0.5 SOL)"}.
        </p>

        <h2 id="pnl">Profit, loss & liquidation</h2>
        <ul>
          <li><b>Profit/loss</b> = position size × price change. Example: a 1 SOL margin at 3x is a 3 SOL position; if the price rises 20%, a long makes 0.6 SOL.</li>
          <li><b>Most you can lose:</b> your margin. Never more.</li>
          <li><b>Liquidation:</b> if a position loses 90% of its margin it&apos;s closed automatically. Anyone can trigger it and earns 10% of what&apos;s left; the rest goes to the vault.</li>
          <li><b>Profit cap:</b> one position can win at most 5× its margin (3× under $100K).</li>
          <li><b>Fees:</b> charged on the position size when opening and again when closing. They go to the vault.</li>
          <li><b>Big positions pay for size:</b> large positions get a slightly worse entry and exit price, the same as if they had traded that size in the pool. This keeps long/short fair with the real market.</li>
        </ul>

        <h2 id="limits">Limits & why</h2>
        <p>These rules make sure the vault can always pay every winner, and that nobody profits by pumping or FUDing a coin:</p>
        <ul>
          <li>Total longs (and total shorts) on one coin can&apos;t exceed <b>5%</b> of its pool liquidity (4% on 10x tiers) or <b>5%</b> of the vault.</li>
          <li>All coins under $100K together can use at most 2% of the vault.</li>
          <li>Minimum hold time and averaged prices stop pump-and-close tricks.</li>
          <li>Leverage turns off automatically when a coin graduates. Open positions can still be closed.</li>
        </ul>
        <p>As the vault grows from fees, the room for positions grows with it.</p>

        <h2 id="vault">The vault</h2>
        <p>
          The vault is an on-chain account owned by the long/short program. It&apos;s filled by 1.9% of every coin trade, long/short
          fees, and margin from losing positions. It pays winning traders.
        </p>
        <ul>
          <li><b>Nobody can withdraw from it:</b> not the team, not the admin. The program has no withdraw function. The only way SOL leaves is a payout to a trader closing a position, or a liquidation reward.</li>
          <li>It&apos;s public. Check its balance anytime: <Addr a={VAULT} /></li>
        </ul>

        <h2 id="faq">FAQ</h2>
        <h3>Do I need to claim holder rewards?</h3>
        <p>No. SOL is sent to your wallet automatically every 15 minutes.</p>
        <h3>Why did my buy pay 90%?</h3>
        <p>It landed in the same block as the launch, which is reserved to punish snipers. Wait a second and buy again.</p>
        <h3>Why can&apos;t I open a long/short on a coin?</h3>
        <p>It&apos;s too new or too small (under $100K it needs 30 minutes and 20 SOL liquidity), it graduated, or the coin&apos;s position limit is full. The panel shows the reason.</p>
        <h3>Can a short win dump the coin?</h3>
        <p>No. Shorts never sell the coin. Winnings come from the vault in SOL.</p>
        <h3>Transaction failed with &quot;no record of a prior credit&quot;?</h3>
        <p>Your wallet is on a different network than the site, or has no SOL. Check the network in your wallet settings.</p>

        <h2 id="addresses">Addresses</h2>
        <ul>
          <li>Launch config (Meteora): <Addr a={DBC_CONFIG.toBase58()} /></li>
          <li>Long/short program: <Addr a={LEVERAGE_PROGRAM.toBase58()} /></li>
          <li>Long/short vault: <Addr a={VAULT} /></li>
          <li>Treasury: <Addr a={TREASURY} /></li>
        </ul>

        <h2 id="risks">Risks</h2>
        <p>
          Memecoins are extremely volatile and most go to zero. Leverage multiplies losses as well as gains. The smart contracts
          are new. Only trade what you can afford to lose, and check whether leveraged trading is allowed where you live.
        </p>
      </article>
    </div>
  );
}

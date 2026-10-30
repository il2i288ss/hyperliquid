/**
 * Keeps one stable "platform" on devnet for the website and keeper:
 * creates the platform config the first time (saved in <stateDir>/platform.json),
 * then launches a demo coin with a first buy big enough for the keeper to
 * register it for long/short.
 *
 *   npx tsx src/devnet-platform.ts <stateDir> [demoBuySol]
 */
import { Keypair, LAMPORTS_PER_SOL, PublicKey, sendAndConfirmTransaction, type Transaction } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import { deriveDbcPoolAddress } from "@meteora-ag/dynamic-bonding-curve-sdk";
import BN from "bn.js";
import fs from "node:fs";
import path from "node:path";
import { connection, dbc, loadKeypair } from "./env.js";
import { curveConfig } from "./create-partner-config.js";

const dir = process.argv[2] ?? ".";
const buySol = Number(process.argv[3] ?? "0.3");
const file = path.join(dir, "platform.json");
const admin = loadKeypair("ADMIN_KEYPAIR");
const send = (tx: Transaction, extra: Keypair[] = []) =>
  sendAndConfirmTransaction(connection, tx, [admin, ...extra], { commitment: "confirmed" });

const NAMES = [["Demo Cat", "DCAT"], ["Test Frog", "TFROG"], ["Devnet Dog", "DDOG"], ["Sample Owl", "SOWL"]];

async function main() {
  const state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { coins: [] };

  if (!state.config) {
    const config = Keypair.generate();
    await send(
      await dbc.partner.createConfig({
        config: config.publicKey,
        feeClaimer: admin.publicKey,
        leftoverReceiver: admin.publicKey,
        payer: admin.publicKey,
        quoteMint: NATIVE_MINT,
        ...curveConfig(false),
      }),
      [config],
    );
    state.config = config.publicKey.toBase58();
    console.log(`created platform config ${state.config}`);
  }

  if (buySol > 0) {
    const [name, symbol] = NAMES[state.coins.length % NAMES.length];
    const mint = Keypair.generate();
    const config = new PublicKey(state.config);
    await send(
      await dbc.creator.createPoolWithFirstBuy({
        createPoolParam: {
          baseMint: mint.publicKey,
          config,
          name,
          symbol,
          uri: "https://example.com/demo.json",
          payer: admin.publicKey,
          poolCreator: admin.publicKey,
        },
        firstBuyParam: {
          buyer: admin.publicKey,
          buyAmount: new BN(Math.round(buySol * LAMPORTS_PER_SOL)),
          minimumAmountOut: new BN(1),
          referralTokenAccount: null,
        },
      }),
      [mint],
    );
    const pool = deriveDbcPoolAddress(NATIVE_MINT, mint.publicKey, config);
    state.coins.push({ mint: mint.publicKey.toBase58(), pool: pool.toBase58(), name, symbol });
    console.log(`launched ${name} ${mint.publicKey.toBase58()}`);
  }

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2));
  // For the workflow's next steps
  if (process.env.GITHUB_ENV) {
    fs.appendFileSync(process.env.GITHUB_ENV, `PLATFORM_CONFIG=${state.config}\nDEMO_MINT=${state.coins.at(-1)?.mint ?? ""}\n`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

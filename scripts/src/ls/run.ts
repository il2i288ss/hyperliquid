/**
 * Starts the bot-run long/short engine inside the keeper.
 *
 * Env: LS=on, VAULT_KEYPAIR (the vault reserve wallet), PLATFORM_CONFIG,
 *      PORT (Railway sets it), LS_TEST=on for devnet values, SOL_USD (test
 *      override), DATA_DIR.
 */
import { Keypair, PublicKey } from "@solana/web3.js";
import { connection, dbc, loadKeypair } from "../env.js";
import { read, write } from "../rewards/store.js";
import { solUsdNow } from "../sol-price.js";
import { Engine, type State } from "./engine.js";
import { serve } from "./server.js";

const SLOT_SECONDS = 0.4;

export async function startLongShort(opts: { every: (job: string, ms: number, fn: () => Promise<void>) => void; log: (job: string, m: string) => void; vault?: Keypair }) {
  const vault = opts.vault ?? loadKeypair("VAULT_KEYPAIR");
  const test = process.env.LS_TEST === "on";
  let solUsd = Number(process.env.SOL_USD) || 0;
  if (!process.env.SOL_USD) solUsd = await solUsdNow();

  const engine = new Engine({
    connection,
    vault,
    test,
    minTrackSol: BigInt(Math.round(Number(process.env.LS_MIN_TRACK_SOL ?? (test ? 0.25 : 5)) * 1e9)),
    store: { load: () => read<State>("ls-state.json", {} as State), save: (s) => write("ls-state.json", s) },
    solUsd: () => solUsd,
    log: (m) => opts.log("ls", m),
  });
  const config = new PublicKey(process.env.PLATFORM_CONFIG!);

  const refreshPools = async () => {
    const [pools, slot] = await Promise.all([dbc.state.getPoolsByConfig(config), connection.getSlot()]);
    await engine.setPools(
      pools.map(({ publicKey, account }) => {
        const s = account.poolState;
        return {
          mint: (s.baseMint as PublicKey).toBase58(),
          pool: publicKey.toBase58(),
          launchedAt: Math.floor(Date.now() / 1000 - (slot - Number(s.activationPoint.toString())) * SLOT_SECONDS),
          poolSol: BigInt(s.quoteReserve.toString()),
          migrated: Boolean(s.isMigrated),
        };
      }),
    );
  };
  await refreshPools();

  opts.every("ls-pools", 60_000, refreshPools);
  opts.every("ls-prices", 8_000, () => engine.recordPrices());
  opts.every("ls-risk", 5_000, () => engine.risk());
  opts.every("ls-payouts", 3_000, () => engine.payouts());
  opts.every("ls-scan", 15_000, () => engine.scan());
  if (!process.env.SOL_USD) opts.every("ls-solusd", 5 * 60_000, async () => void (solUsd = await solUsdNow()));

  serve(engine, Number(process.env.PORT ?? 8080), (m) => opts.log("ls", m));
  opts.log("ls", `long/short engine on · vault ${vault.publicKey.toBase58()} · ${test ? "TEST values" : "mainnet values"} · SOL $${solUsd.toFixed(2)}`);
  return engine;
}

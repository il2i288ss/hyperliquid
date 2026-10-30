/**
 * Creates the Meteora DBC partner config that every coin launched on the
 * platform uses. Run once per network:
 *
 *   npm run config         (normal coins: fees -> fee splitter)
 *   npm run config:main    (your main platform coin: fees -> team wallet)
 *
 * Built against @meteora-ag/dynamic-bonding-curve-sdk 1.5.x.
 */
import { Keypair, sendAndConfirmTransaction } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import {
  ActivationType,
  BaseFeeMode,
  CollectFeeMode,
  DammV2DynamicFeeMode,
  MigratedCollectFeeMode,
  MigrationFeeOption,
  MigrationOption,
  TokenAuthorityOption,
  TokenDecimal,
  TokenType,
  buildCurveWithMarketCap,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import fs from "node:fs";
import { connection, dbc, loadKeypair, pubkey } from "./env.js";
import {
  LAUNCH_FEE_SOL,
  MAIN_COIN_POOL_FEE_BPS,
  POOL_FEE_BPS,
  SNIPE_FEE_BPS,
} from "./platform.js";

const isMain = process.argv.includes("--main");

/** Curve shape, in SOL market cap. Tune before mainnet. */
const INITIAL_MCAP_SOL = 30;
const MIGRATION_MCAP_SOL = 400;

export function curveConfig(
  main: boolean,
  /** Test-only override: a shallower curve so small buys move the price. */
  opts: { initialMcapSol?: number; migrationMcapSol?: number } = {},
) {
  const poolFeeBps = main ? MAIN_COIN_POOL_FEE_BPS : POOL_FEE_BPS;
  return buildCurveWithMarketCap({
    token: {
      tokenType: TokenType.SPLToken,
      tokenBaseDecimal: TokenDecimal.SIX,
      tokenQuoteDecimal: TokenDecimal.NINE, // SOL
      tokenAuthorityOption: TokenAuthorityOption.Immutable, // nobody can change the token
      totalTokenSupply: 1_000_000_000,
      leftover: 0,
    },
    fee: {
      // Anti-sniper: linear scheduler with ONE period lasting ONE slot.
      // Launch slot pays SNIPE_FEE_BPS (90%), every later slot pays poolFeeBps.
      baseFeeParams: {
        baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
        feeSchedulerParam: {
          startingFeeBps: SNIPE_FEE_BPS,
          endingFeeBps: poolFeeBps,
          numberOfPeriod: 1,
          totalDuration: 1, // slots, because activationType is Slot
        },
      },
      dynamicFeeEnabled: false,
      collectFeeMode: CollectFeeMode.QuoteToken, // all fees in SOL
      // Platform coins: 100% of the non-Meteora fee -> partner (split to holders/vault).
      // Main coin: 100% -> the wallet that launched it.
      creatorTradingFeePercentage: main ? 100 : 0,
      poolCreationFee: main ? 0 : LAUNCH_FEE_SOL,
      // The creator's first buy inside the launch tx pays the normal fee.
      enableFirstSwapWithMinFee: true,
    },
    migration: {
      migrationOption: MigrationOption.MET_DAMM_V2,
      migrationFeeOption: MigrationFeeOption.Customizable,
      migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
      // Graduated DAMM v2 pool keeps the same fee, paid in SOL.
      migratedPoolFee: {
        collectFeeMode: MigratedCollectFeeMode.QuoteToken,
        dynamicFee: DammV2DynamicFeeMode.Disabled,
        poolFeeBps,
      },
    },
    // All LP is locked forever; fees stay claimable.
    liquidityDistribution: {
      // Main coin: the locked LP (and its fees after graduation) belongs to the launcher.
      partnerPermanentLockedLiquidityPercentage: main ? 0 : 100,
      partnerLiquidityPercentage: 0,
      creatorPermanentLockedLiquidityPercentage: main ? 100 : 0,
      creatorLiquidityPercentage: 0,
    },
    lockedVesting: {
      totalLockedVestingAmount: 0,
      numberOfVestingPeriod: 0,
      cliffUnlockAmount: 0,
      totalVestingDuration: 0,
      cliffDurationFromMigrationTime: 0,
    },
    activationType: ActivationType.Slot,
    initialMarketCap: opts.initialMcapSol ?? INITIAL_MCAP_SOL,
    migrationMarketCap: opts.migrationMcapSol ?? MIGRATION_MCAP_SOL,
  });
}

export async function main() {
  const admin = loadKeypair("ADMIN_KEYPAIR");
  // The fee bot claims for both configs (it must sign claims). For the main
  // coin it sends everything straight to the treasury (see claim-fees.ts).
  const feeClaimer = pubkey("FEE_SPLITTER_WALLET");
  const config = Keypair.generate();

  const tx = await dbc.partner.createConfig({
    config: config.publicKey,
    feeClaimer,
    leftoverReceiver: feeClaimer,
    payer: admin.publicKey,
    quoteMint: NATIVE_MINT,
    ...curveConfig(isMain),
  });

  const sig = await sendAndConfirmTransaction(connection, tx, [admin, config]);
  console.log(`${isMain ? "Main coin" : "Platform"} config:`, config.publicKey.toBase58());
  console.log("tx:", sig);

  const file = "deployments.json";
  const deployments = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  deployments[isMain ? "mainCoinConfig" : "platformConfig"] = config.publicKey.toBase58();
  fs.writeFileSync(file, JSON.stringify(deployments, null, 2));
  console.log(`Saved to ${file}. Put it in the website settings as NEXT_PUBLIC_DBC_CONFIG.`);
}

if (process.argv[1]?.endsWith("create-partner-config.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

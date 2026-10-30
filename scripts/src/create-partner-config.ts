/**
 * Creates the Meteora DBC partner config that every coin launched on the
 * platform uses. Run once per network:
 *
 *   npx tsx src/create-partner-config.ts            (normal coins)
 *   npx tsx src/create-partner-config.ts --main     (your main platform coin)
 *
 * NOTE: parameter names follow @meteora-ag/dynamic-bonding-curve-sdk. Lines
 * marked VERIFY are the ones to double-check against the SDK version you
 * install (npm i), because they could not be compiled in the build sandbox.
 */
import { Keypair } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import {
  ActivationType,
  BaseFeeMode,
  CollectFeeMode,
  MigrationFeeOption,
  MigrationOption,
  TokenDecimal,
  TokenType,
  TokenUpdateAuthorityOption,
  buildCurveWithMarketCap,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import { sendAndConfirmTransaction } from "@solana/web3.js";
import fs from "node:fs";
import { connection, dbc, loadKeypair, pubkey } from "./env.js";
import {
  LAUNCH_FEE_LAMPORTS,
  MAIN_COIN_POOL_FEE_BPS,
  POOL_FEE_BPS,
  SNIPE_FEE_BPS,
} from "./platform.js";

const isMain = process.argv.includes("--main");

async function main() {
  const admin = loadKeypair("ADMIN_KEYPAIR");
  // Normal coins: fees go to the splitter wallet. Main coin: to the team wallet.
  const feeClaimer = isMain ? pubkey("TEAM_WALLET") : pubkey("FEE_SPLITTER_WALLET");
  const poolFeeBps = isMain ? MAIN_COIN_POOL_FEE_BPS : POOL_FEE_BPS;
  const config = Keypair.generate();

  const curve = buildCurveWithMarketCap({
    totalTokenSupply: 1_000_000_000,
    initialMarketCap: 30, // in quote units (SOL) at launch       VERIFY units
    migrationMarketCap: 400, // graduates to DAMM v2 at ~400 SOL mcap
    migrationOption: MigrationOption.MET_DAMM_V2,
    tokenBaseDecimal: TokenDecimal.SIX,
    tokenQuoteDecimal: TokenDecimal.NINE,
    tokenType: TokenType.SPL,
    lockedVestingParam: {
      totalLockedVestingAmount: 0,
      numberOfVestingPeriod: 0,
      cliffUnlockAmount: 0,
      totalVestingDuration: 0,
      cliffDurationFromMigrationTime: 0,
    },
    // Anti-sniper: 90% in the launch slot, normal fee from the next slot.
    // Linear scheduler with ONE period lasting ONE slot.            VERIFY
    baseFeeParams: {
      baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
      feeSchedulerParam: {
        startingFeeBps: isMain ? 9_000 : SNIPE_FEE_BPS,
        endingFeeBps: poolFeeBps,
        numberOfPeriod: 1,
        totalDuration: 1, // 1 slot because activationType is Slot
      },
    },
    activationType: ActivationType.Slot,
    dynamicFeeEnabled: false,
    collectFeeMode: CollectFeeMode.QuoteToken, // all fees paid in SOL
    // Creator's first buy inside the launch tx pays the normal fee,
    // not the 90% snipe fee.                                        VERIFY
    enableFirstSwapWithMinFee: true,
    creatorTradingFeePercentage: 0, // 100% of the non-Meteora fee -> partner
    partnerLpPercentage: 0,
    creatorLpPercentage: 0,
    partnerLockedLpPercentage: 100, // LP locked forever, fees still claimable
    creatorLockedLpPercentage: 0,
    leftover: 0,
    tokenUpdateAuthority: TokenUpdateAuthorityOption.Immutable,
    // After graduation the DAMM v2 pool keeps the same fee.         VERIFY
    migrationFeeOption: MigrationFeeOption.Customizable,
    migratedPoolFee: {
      collectFeeMode: CollectFeeMode.QuoteToken,
      dynamicFee: 0,
      poolFeeBps,
    },
    migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
    poolCreationFee: isMain ? 0 : LAUNCH_FEE_LAMPORTS, // 0.03 SOL  VERIFY
  });

  const tx = await dbc.partner.createConfig({
    config: config.publicKey,
    feeClaimer,
    leftoverReceiver: feeClaimer,
    payer: admin.publicKey,
    quoteMint: NATIVE_MINT,
    ...curve,
  });

  const sig = await sendAndConfirmTransaction(connection, tx, [admin, config]);
  console.log(`${isMain ? "Main coin" : "Platform"} config:`, config.publicKey.toBase58());
  console.log("tx:", sig);

  const file = "deployments.json";
  const deployments = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  deployments[isMain ? "mainCoinConfig" : "platformConfig"] = config.publicKey.toBase58();
  fs.writeFileSync(file, JSON.stringify(deployments, null, 2));
  console.log(`Saved to ${file}. Put it in app/.env as NEXT_PUBLIC_DBC_CONFIG.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

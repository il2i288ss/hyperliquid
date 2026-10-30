/**
 * Claims all partner trading fees + launch fees from every pool under a
 * config and sends them to a receiver wallet.
 *
 *   npx tsx src/claim-fees.ts          (platform coins -> fee splitter wallet)
 *   npx tsx src/claim-fees.ts --main   (main coin      -> team wallet)
 *
 * Runs every 15 minutes before split + airdrop, or from an admin button.
 */
import { PublicKey, sendAndConfirmTransaction } from "@solana/web3.js";
import BN from "bn.js";
import fs from "node:fs";
import { connection, dbc, loadKeypair, pubkey } from "./env.js";
import { SPLIT_BPS } from "./platform.js";
import { addHoldersDue, addLaunchFees } from "./rewards/store.js";

const U64_MAX = new BN("18446744073709551615");
const isMain = process.argv.includes("--main");

async function main() {
  const claimer = loadKeypair(isMain ? "TEAM_KEYPAIR" : "FEE_SPLITTER_KEYPAIR");
  const receiver = isMain ? pubkey("TEAM_WALLET") : pubkey("FEE_SPLITTER_WALLET");
  const deployments = JSON.parse(fs.readFileSync("deployments.json", "utf8"));
  const config = new PublicKey(isMain ? deployments.mainCoinConfig : deployments.platformConfig);

  const pools = await dbc.state.getPoolsByConfig(config);
  console.log(`Found ${pools.length} pools under ${config.toBase58()}`);

  // Measure what each claim actually brought in (balance before/after),
  // so holder rewards are tracked per coin.
  const bal = async () => BigInt(await connection.getBalance(receiver));
  const holdersShare = (x: bigint) => (x * BigInt(SPLIT_BPS.holders)) / 300n;

  let claimed = 0;
  for (const { publicKey: pool, account } of pools) {
    const mint = account.poolState.baseMint.toBase58();
    try {
      const before = await bal();
      const tx = await dbc.partner.claimPartnerTradingFeeToReceiver({
        feeClaimer: claimer.publicKey,
        payer: claimer.publicKey,
        pool,
        receiver,
        maxBaseAmount: U64_MAX,
        maxQuoteAmount: U64_MAX,
      });
      await sendAndConfirmTransaction(connection, tx, [claimer]);
      const gained = (await bal()) - before;
      if (!isMain && gained > 0n) addHoldersDue(mint, holdersShare(gained));
      claimed++;
    } catch (e) {
      // Pools with nothing to claim fail harmlessly; log and move on.
      console.warn(`skip ${pool.toBase58()}: ${(e as Error).message.split("\n")[0]}`);
    }

    if (!isMain) {
      try {
        const before = await bal();
        // Meteora keeps 10% of each launch fee; the rest comes to us.
        const tx = await dbc.partner.claimPartnerPoolCreationFee({ pool, feeReceiver: receiver });
        await sendAndConfirmTransaction(connection, tx, [claimer]);
        const gained = (await bal()) - before;
        if (gained > 0n) addLaunchFees(gained); // launch fees -> 100% treasury
      } catch {
        /* already claimed */
      }
    }
  }
  console.log(`Claimed from ${claimed}/${pools.length} pools.`);
  // Graduated pools: fees come from the locked DAMM v2 LP position.
  // Claim those with the DAMM v2 SDK (cp-amm-sdk: claimPositionFee) — see README.
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

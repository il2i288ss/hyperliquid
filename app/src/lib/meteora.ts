import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import {
  DynamicBondingCurveClient,
  deriveDbcPoolAddress,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import BN from "bn.js";

import { DBC_CONFIG as CONFIG } from "./config";

export function client(connection: Connection) {
  return DynamicBondingCurveClient.create(connection, "confirmed");
}

export function poolForMint(mint: PublicKey) {
  return deriveDbcPoolAddress(NATIVE_MINT, mint, CONFIG);
}

/**
 * Builds the launch transaction. The creator's wallet pays and signs, so they
 * are the on-chain creator. The new mint keypair also signs (done here).
 * If firstBuySol > 0 the creator buys in the same transaction, which is
 * exempt from the 90% launch-slot fee.
 */
export async function buildLaunchTx(opts: {
  connection: Connection;
  creator: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  firstBuySol: number;
}): Promise<{ tx: Transaction; mint: PublicKey }> {
  const { connection, creator, name, symbol, uri, firstBuySol } = opts;
  const dbc = client(connection);
  const mint = Keypair.generate();

  const createPoolParam = {
    baseMint: mint.publicKey,
    config: CONFIG,
    name,
    symbol,
    uri,
    payer: creator,
    poolCreator: creator,
  };

  // One transaction: create the coin and (optionally) the creator's first
  // buy, which pays the normal fee instead of the 90% launch-slot fee.
  const tx: Transaction =
    firstBuySol > 0
      ? await dbc.creator.createPoolWithFirstBuy({
          createPoolParam,
          firstBuyParam: {
            buyer: creator,
            buyAmount: new BN(Math.round(firstBuySol * 1e9)),
            minimumAmountOut: new BN(1),
            referralTokenAccount: null,
          },
        })
      : await dbc.creator.createPool(createPoolParam);

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = creator;
  tx.partialSign(mint);
  return { tx, mint: mint.publicKey };
}

/** Buy or sell on the curve. minOut protects users from the 90% launch fee. */
export async function buildSwapTx(opts: {
  connection: Connection;
  owner: PublicKey;
  mint: PublicKey;
  buy: boolean;
  amountIn: BN;
  slippageBps: number;
}) {
  const { connection, owner, mint, buy, amountIn, slippageBps } = opts;
  const dbc = client(connection);
  const pool = poolForMint(mint);
  const virtualPool = await dbc.state.getPool(pool);
  if (!virtualPool) throw new Error("Coin not found on this launchpad");
  const poolConfig = await dbc.state.getPoolConfig(virtualPool.poolState.config);
  if (!poolConfig) throw new Error("Coin config not found");
  const currentPoint = new BN(await connection.getSlot());

  // minimumAmountOut makes the swap fail instead of paying the 90%
  // launch-slot fee if it lands in the launch slot.
  const quote = dbc.pool.swapQuote({
    virtualPool,
    config: poolConfig,
    swapBaseForQuote: !buy,
    amountIn,
    slippageBps,
    hasReferral: false,
    eligibleForFirstSwapWithMinFee: false,
    currentPoint,
  });

  const tx = await dbc.pool.swap({
    owner,
    pool,
    amountIn,
    minimumAmountOut: quote.minimumAmountOut,
    swapBaseForQuote: !buy,
    referralTokenAccount: null,
  });
  return { tx, quote };
}

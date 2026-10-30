import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import {
  DynamicBondingCurveClient,
  deriveDbcPoolAddress,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import BN from "bn.js";

export const CONFIG = new PublicKey(process.env.NEXT_PUBLIC_DBC_CONFIG!);
export const LAUNCH_FEE_SOL = 0.03;

export function client(connection: Connection) {
  return DynamicBondingCurveClient.create(connection, "confirmed");
}

export function poolForMint(mint: PublicKey) {
  // VERIFY: argument order (quoteMint, baseMint, config) in your SDK version.
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

  let tx: Transaction;
  if (firstBuySol > 0) {
    // VERIFY: return shape of createPoolWithFirstBuy in your SDK version.
    const res: any = await dbc.pool.createPoolWithFirstBuy({
      createPoolParam,
      firstBuyParam: {
        buyer: creator,
        buyAmount: new BN(Math.round(firstBuySol * 1e9)),
        minimumAmountOut: new BN(1),
        referralTokenAccount: null,
      },
    });
    if (res instanceof Transaction) {
      tx = res;
    } else {
      // Some SDK versions return the create and buy parts separately;
      // combine them so the buy lands in the launch transaction.
      tx = new Transaction();
      for (const part of [res.createPoolTx, res.swapBuyTx]) {
        if (part) tx.add(...part.instructions);
      }
    }
  } else {
    tx = await dbc.pool.createPool(createPoolParam);
  }

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
  const poolConfig = await dbc.state.getPoolConfig(CONFIG);
  const currentPoint = new BN(await connection.getSlot());

  // VERIFY: swapQuote params/return in your SDK version.
  const quote: any = await dbc.pool.swapQuote({
    virtualPool,
    config: poolConfig,
    swapBaseForQuote: !buy,
    amountIn,
    slippageBps,
    hasReferral: false,
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

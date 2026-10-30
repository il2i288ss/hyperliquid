// Single source of truth for platform economics.
// Every script and the website read these values.

export const LAMPORTS_PER_SOL = 1_000_000_000;

/**
 * Where everything the platform earns goes: the 0.1% treasury share of
 * trading fees, every launch fee, and the main coin's fees.
 * TREASURY_WALLET / TEAM_WALLET env vars override it.
 */
export const TREASURY_ADDRESS = "GCHZXtrG8dF8n7KNgcxWGR4QpCBhf71ZBgrQDeKroUi6";

/**
 * Launch fee charged by the Meteora config when a coin is created.
 * Meteora keeps 10% (PROTOCOL_POOL_CREATION_FEE_PERCENT), so the platform
 * nets 0.027 SOL per launch.
 */
export const LAUNCH_FEE_SOL = 0.03;
export const LAUNCH_FEE_LAMPORTS = 30_000_000;

/**
 * Pool trading fee. Meteora keeps 20% of it, so 3.75% leaves the platform
 * a clean 3.00% to split.
 */
export const POOL_FEE_BPS = 375;
export const METEORA_PROTOCOL_SHARE = 0.2;

/** Anti-sniper: fee charged in the launch slot only. */
export const SNIPE_FEE_BPS = 9_000; // 90%

/**
 * How the platform's 3% is split, in basis points of trade volume.
 * Must add up to 300.
 */
export const SPLIT_BPS = {
  holders: 100, // 1%   -> SOL airdropped to holders
  treasury: 10, // 0.1% -> platform treasury
  vault: 190, //   1.9% -> long/short vault
  creator: 0, //   set >0 to share with coin creators (taken from vault share)
} as const;

/** Main platform coin: 100% of the platform's share goes to the team wallet. */
export const MAIN_COIN_POOL_FEE_BPS = 125; // ~1% net after Meteora's cut

export type SplitKey = keyof typeof SPLIT_BPS;

/**
 * Split a lamport amount according to SPLIT_BPS.
 * Rounding dust goes to the vault so nothing is lost.
 */
export function splitLamports(total: bigint): Record<SplitKey, bigint> {
  const sum = BigInt(
    SPLIT_BPS.holders + SPLIT_BPS.treasury + SPLIT_BPS.vault + SPLIT_BPS.creator,
  );
  if (sum !== 300n) throw new Error(`SPLIT_BPS must add up to 300, got ${sum}`);
  const holders = (total * BigInt(SPLIT_BPS.holders)) / sum;
  const treasury = (total * BigInt(SPLIT_BPS.treasury)) / sum;
  const creator = (total * BigInt(SPLIT_BPS.creator)) / sum;
  const vault = total - holders - treasury - creator;
  return { holders, treasury, vault, creator };
}

/**
 * Coin data read straight from the chain: every pool under the platform's
 * Meteora config, its token metadata, price, market cap and curve progress.
 * Runs on the server (see /api/coins) so browsers don't hammer the RPC.
 * Trades, holders and charts come from the indexer (phase 2).
 */
import { Connection, PublicKey } from "@solana/web3.js";
import { DynamicBondingCurveClient } from "@meteora-ag/dynamic-bonding-curve-sdk";
import bs58 from "bs58";
import { DBC_CONFIG, FALLBACK_SOL_USD, LEVERAGE_ENABLED, LEVERAGE_PROGRAM, RPC_URL, TOTAL_SUPPLY } from "./config";
import { decodeGlobal, decodeMarket, globalPda } from "./leverage";

const MARKET_DISC = Buffer.from([219, 190, 213, 55, 0, 227, 198, 154]);

const METAPLEX = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const SLOT_SECONDS = 0.4;

export type Coin = {
  mint: string;
  pool: string;
  creator: string;
  name: string;
  symbol: string;
  uri: string;
  priceSol: number;
  priceUsd: number;
  mcapUsd: number;
  quoteReserveSol: number;
  curveProgress: number; // 0..1
  graduated: boolean;
  ageSeconds: number;
  /** Long/short is registered and enabled for this coin. */
  leverage: boolean;
};

const metadataPda = (mint: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from("metadata"), METAPLEX.toBuffer(), mint.toBuffer()], METAPLEX)[0];

/** Parse name/symbol/uri from a Metaplex metadata account. */
function parseMetadata(data: Buffer) {
  let o = 1 + 32 + 32;
  const str = () => {
    const len = data.readUInt32LE(o);
    o += 4;
    const s = data.subarray(o, o + len).toString("utf8").replace(/\0/g, "").trim();
    o += len;
    return s;
  };
  return { name: str(), symbol: str(), uri: str() };
}

const toNum = (v: { toString(): string }) => Number(v.toString());

/** SOL per whole token from a Q64.64 sqrt price (6-decimal token, 9-decimal SOL). */
function priceFromSqrt(sqrt: { toString(): string }) {
  const s = toNum(sqrt) / 2 ** 64;
  return (s * s) / 1e3;
}

export async function solUsd(connection: Connection) {
  if (!LEVERAGE_ENABLED) return FALLBACK_SOL_USD;
  const info = await connection.getAccountInfo(globalPda());
  const g = info ? decodeGlobal(info.data as Buffer) : null;
  return g && g.solUsd > 0 ? g.solUsd : FALLBACK_SOL_USD;
}

let cache: { at: number; coins: Coin[] } | null = null;

export async function listCoins(): Promise<Coin[]> {
  if (cache && Date.now() - cache.at < 10_000) return cache.coins;
  const connection = new Connection(RPC_URL, "confirmed");
  const dbc = DynamicBondingCurveClient.create(connection, "confirmed");
  const [pools, config, slot, usd, markets] = await Promise.all([
    dbc.state.getPoolsByConfig(DBC_CONFIG),
    dbc.state.getPoolConfig(DBC_CONFIG),
    connection.getSlot(),
    solUsd(connection),
    LEVERAGE_ENABLED
      ? connection
          .getProgramAccounts(LEVERAGE_PROGRAM, { filters: [{ memcmp: { offset: 0, bytes: bs58.encode(MARKET_DISC) } }] })
          .catch(() => [])
      : Promise.resolve([]),
  ]);
  const enabled = new Set(
    markets.map((m) => decodeMarket(m.account.data as Buffer)).filter((m) => m.enabled).map((m) => m.mint.toBase58()),
  );
  const threshold = config ? toNum(config.migrationQuoteThreshold) : 0;

  const mints = pools.map((p) => p.account.poolState.baseMint as PublicKey);
  const metas: (ReturnType<typeof parseMetadata> | null)[] = [];
  for (let i = 0; i < mints.length; i += 100) {
    const infos = await connection.getMultipleAccountsInfo(mints.slice(i, i + 100).map(metadataPda));
    infos.forEach((info) => {
      try {
        metas.push(info ? parseMetadata(info.data as Buffer) : null);
      } catch {
        metas.push(null);
      }
    });
  }

  const coins = pools.map(({ publicKey, account }, i): Coin => {
    const s = account.poolState;
    const priceSol = priceFromSqrt(s.sqrtPrice);
    const quote = toNum(s.quoteReserve);
    const meta = metas[i];
    return {
      mint: mints[i].toBase58(),
      pool: publicKey.toBase58(),
      creator: (s.creator as PublicKey).toBase58(),
      name: meta?.name || "Unnamed",
      symbol: meta?.symbol || "?",
      uri: meta?.uri || "",
      priceSol,
      priceUsd: priceSol * usd,
      mcapUsd: priceSol * TOTAL_SUPPLY * usd,
      quoteReserveSol: quote / 1e9,
      curveProgress: threshold ? Math.min(quote / threshold, 1) : 0,
      graduated: Boolean(s.isMigrated),
      ageSeconds: Math.max(0, (slot - toNum(s.activationPoint)) * SLOT_SECONDS),
      leverage: enabled.has(mints[i].toBase58()),
    };
  });
  coins.sort((a, b) => a.ageSeconds - b.ageSeconds);
  cache = { at: Date.now(), coins };
  return coins;
}

export async function getCoin(mint: string) {
  return (await listCoins()).find((c) => c.mint === mint) ?? null;
}

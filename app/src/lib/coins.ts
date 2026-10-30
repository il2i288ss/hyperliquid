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
  image: string;
  description: string;
  links: { website?: string; twitter?: string; telegram?: string };
};

type OffChain = { image: string; description: string; links: Coin["links"] };
const offChain = new Map<string, OffChain>();
const ipfs = (u: string) => (u.startsWith("ipfs://") ? `https://gateway.pinata.cloud/ipfs/${u.slice(7)}` : u);
const safeUrl = (u: unknown) => (typeof u === "string" && /^https:\/\//.test(ipfs(u)) ? ipfs(u) : "");

/** Image, description and links from the metadata JSON (cached forever per uri). */
async function loadOffChain(uris: string[]) {
  const todo = [...new Set(uris)].filter((u) => u && !offChain.has(u)).slice(0, 40);
  await Promise.all(
    todo.map(async (uri) => {
      try {
        const r = await fetch(ipfs(uri), { signal: AbortSignal.timeout(4_000) });
        const j = await r.json();
        const ext = j.extensions ?? {};
        offChain.set(uri, {
          image: safeUrl(j.image),
          description: typeof j.description === "string" ? j.description.slice(0, 500) : "",
          links: { website: safeUrl(ext.website) || undefined, twitter: safeUrl(ext.twitter) || undefined, telegram: safeUrl(ext.telegram) || undefined },
        });
      } catch {
        /* try again next refresh */
      }
    }),
  );
}

let usdCache: { at: number; v: number } | null = null;
/** Live SOL/USD for display (Coinbase, then Kraken), cached 60 s. */
async function liveSolUsd(): Promise<number | null> {
  if (usdCache && Date.now() - usdCache.at < 60_000) return usdCache.v;
  for (const [url, pick] of [
    ["https://api.coinbase.com/v2/prices/SOL-USD/spot", (j: any) => Number(j.data.amount)],
    ["https://api.kraken.com/0/public/Ticker?pair=SOLUSD", (j: any) => Number((Object.values(j.result)[0] as { c: string[] }).c[0])],
  ] as const) {
    try {
      const v = pick(await (await fetch(url, { signal: AbortSignal.timeout(4_000) })).json());
      if (v > 1 && v < 100_000) {
        usdCache = { at: Date.now(), v };
        return v;
      }
    } catch {
      /* next source */
    }
  }
  return usdCache?.v ?? null;
}

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
  const info = LEVERAGE_ENABLED ? await connection.getAccountInfo(globalPda()).catch(() => null) : null;
  const g = info ? decodeGlobal(info.data as Buffer) : null;
  // The on-chain rate is what long/short tiers use. Devnet test builds set a
  // fake price on purpose, so use it there; otherwise prefer the live price.
  if (g?.testBuild && g.solUsd > 0) return g.solUsd;
  return (await liveSolUsd()) ?? (g && g.solUsd > 0 ? g.solUsd : FALLBACK_SOL_USD);
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

  await loadOffChain(metas.map((m) => m?.uri ?? ""));

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
      image: offChain.get(meta?.uri ?? "")?.image ?? "",
      description: offChain.get(meta?.uri ?? "")?.description ?? "",
      links: offChain.get(meta?.uri ?? "")?.links ?? {},
    };
  });
  coins.sort((a, b) => a.ageSeconds - b.ageSeconds);
  cache = { at: Date.now(), coins };
  return coins;
}

export async function getCoin(mint: string) {
  return (await listCoins()).find((c) => c.mint === mint) ?? null;
}

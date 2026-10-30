/**
 * Browser client for the long/short program (same layout as
 * scripts/src/leverage/client.ts, with the Anchor discriminators
 * precomputed so it needs no Node crypto).
 */
import { Buffer } from "buffer";
import {
  type Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  type AccountMeta,
} from "@solana/web3.js";
import bs58 from "bs58";
import { LEVERAGE_PROGRAM } from "./config";

const DISC = {
  open_position: [135, 128, 47, 77, 15, 152, 240, 49],
  close_position: [123, 134, 81, 0, 49, 68, 98, 98],
  Position: [170, 188, 143, 228, 122, 64, 247, 208],
} as const;

const u8 = (v: number) => Buffer.from([v]);
const bool = (v: boolean) => u8(v ? 1 : 0);
const u64 = (v: bigint) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(v);
  return b;
};
const w = (pubkey: PublicKey, isSigner = false): AccountMeta => ({ pubkey, isSigner, isWritable: true });
const r = (pubkey: PublicKey): AccountMeta => ({ pubkey, isSigner: false, isWritable: false });
const pda = (seeds: Buffer[]) => PublicKey.findProgramAddressSync(seeds, LEVERAGE_PROGRAM)[0];

export const globalPda = () => pda([Buffer.from("global")]);
export const vaultPda = () => pda([Buffer.from("vault")]);
export const marketPda = (mint: PublicKey) => pda([Buffer.from("market"), mint.toBuffer()]);
export const positionPda = (market: PublicKey, owner: PublicKey, nonce: bigint) =>
  pda([Buffer.from("pos"), market.toBuffer(), owner.toBuffer(), u64(nonce)]);

export function openPositionIx(owner: PublicKey, mint: PublicKey, nonce: bigint, long: boolean, marginLamports: bigint, leverage: number) {
  const market = marketPda(mint);
  return new TransactionInstruction({
    programId: LEVERAGE_PROGRAM,
    keys: [w(owner, true), r(globalPda()), w(vaultPda()), w(market), w(positionPda(market, owner, nonce)), r(SystemProgram.programId)],
    data: Buffer.concat([Buffer.from(DISC.open_position), u64(nonce), bool(long), u64(marginLamports), u8(leverage)]),
  });
}

export function closePositionIx(owner: PublicKey, mint: PublicKey, nonce: bigint) {
  const market = marketPda(mint);
  return new TransactionInstruction({
    programId: LEVERAGE_PROGRAM,
    keys: [w(owner, true), w(vaultPda()), w(market), w(positionPda(market, owner, nonce))],
    data: Buffer.from(DISC.close_position),
  });
}

// ---------- decoding ----------
class Reader {
  o = 8;
  constructor(private b: Buffer) {}
  u8() { return this.b.readUInt8(this.o++); }
  bool() { return this.u8() === 1; }
  u16() { const v = this.b.readUInt16LE(this.o); this.o += 2; return v; }
  u64() { const v = this.b.readBigUInt64LE(this.o); this.o += 8; return v; }
  i64() { const v = this.b.readBigInt64LE(this.o); this.o += 8; return v; }
  u128() { const lo = this.u64(); const hi = this.u64(); return (hi << 64n) | lo; }
  key() { const k = new PublicKey(this.b.subarray(this.o, this.o + 32)); this.o += 32; return k; }
}

export type GlobalState = { solUsd: number; paused: boolean; testBuild: boolean };
export function decodeGlobal(data: Buffer): GlobalState {
  const rd = new Reader(data);
  rd.key(); rd.key();
  const solUsd = Number(rd.u64()) / 1e6;
  const paused = rd.bool();
  const testBuild = rd.bool();
  return { solUsd, paused, testBuild };
}

export function decodeVault(data: Buffer) {
  const rd = new Reader(data);
  return { lockedMargin: rd.u64(), degenOi: rd.u64() };
}

export type MarketState = ReturnType<typeof decodeMarket>;
export function decodeMarket(data: Buffer) {
  const rd = new Reader(data);
  return {
    mint: rd.key(),
    pool: rd.key(),
    poolKind: rd.u8(),
    supply: rd.u64(),
    launchedAt: Number(rd.i64()),
    enabled: rd.bool(),
    poolSol: Number(rd.u64()) / 1e9,
    oiLong: Number(rd.u64()) / 1e9,
    oiShort: Number(rd.u64()) / 1e9,
  };
}

export type Position = ReturnType<typeof decodePosition> & { address: PublicKey };
const PRICE_SCALE = 1e12;
export function decodePosition(data: Buffer) {
  const rd = new Reader(data);
  const owner = rd.key();
  const market = rd.key();
  const nonce = rd.u64();
  const long = rd.bool();
  const margin = Number(rd.u64()) / 1e9;
  const notional = Number(rd.u64()) / 1e9;
  const entryPrice = Number(rd.u128()) / PRICE_SCALE; // lamports per raw token unit
  const openedAt = Number(rd.i64());
  const tier = rd.u8();
  return { owner, market, nonce, long, margin, notional, entryPrice, openedAt, tier };
}

/** All open positions of a wallet. */
export async function fetchPositions(connection: Connection, owner: PublicKey): Promise<Position[]> {
  const accounts = await connection.getProgramAccounts(LEVERAGE_PROGRAM, {
    filters: [
      { memcmp: { offset: 0, bytes: bs58.encode(Buffer.from(DISC.Position)) } },
      { memcmp: { offset: 8, bytes: owner.toBase58() } },
    ],
  });
  return accounts.map(({ pubkey, account }) => ({ ...decodePosition(account.data as Buffer), address: pubkey }));
}

const ERRORS = [
  "Paused", "MarketDisabled", "TierLocked", "TooMuchLeverage", "MarginTooBig", "CapReached",
  "HoldTime", "NotLiquidatable", "StalePrice", "VaultEmpty", "BadPool", "PoolLayoutNotSet",
  "MathOverflow", "Unauthorized",
];
const FRIENDLY: Record<string, string> = {
  Paused: "New positions are paused right now.",
  MarketDisabled: "Long/short is turned off for this coin.",
  TierLocked: "This coin hasn't unlocked long/short yet.",
  TooMuchLeverage: "That leverage is above this coin's tier.",
  MarginTooBig: "That margin is above this coin's limit.",
  CapReached: "Long/short capacity for this coin is full. Try a smaller size.",
  HoldTime: "Positions must be held for the minimum time before closing.",
  StalePrice: "Not enough price history yet. Try again in a minute.",
  VaultEmpty: "The vault can't cover this payout right now.",
};
/** Human message for a failed long/short transaction. */
export function leverageError(e: unknown): string {
  const msg = String((e as Error)?.message ?? e) + JSON.stringify((e as { logs?: unknown })?.logs ?? "");
  const m = msg.match(/custom program error: 0x([0-9a-f]+)/i);
  if (m) {
    const name = ERRORS[parseInt(m[1], 16) - 6000];
    if (name) return FRIENDLY[name] ?? name;
  }
  if (/User rejected/i.test(msg)) return "Cancelled in wallet.";
  return msg.split("\n")[0].slice(0, 200);
}

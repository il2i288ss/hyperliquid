/**
 * Minimal TypeScript client for the long/short program. Encodes Anchor
 * instructions by hand (8-byte sha256 discriminator + borsh args), so it
 * needs no IDL or Anchor CLI. Account order must match the Rust contexts.
 */
import { PublicKey, SystemProgram, TransactionInstruction, type AccountMeta } from "@solana/web3.js";
import { createHash } from "node:crypto";

const disc = (prefix: string, name: string) =>
  createHash("sha256").update(`${prefix}:${name}`).digest().subarray(0, 8);
const ixDisc = (name: string) => disc("global", name);

// ---------- borsh helpers ----------
const u8 = (v: number) => Buffer.from([v]);
const bool = (v: boolean) => u8(v ? 1 : 0);
const u64 = (v: bigint) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(v);
  return b;
};
const i64 = (v: bigint) => {
  const b = Buffer.alloc(8);
  b.writeBigInt64LE(v);
  return b;
};
const key = (k: PublicKey) => k.toBuffer();

const w = (pubkey: PublicKey, isSigner = false): AccountMeta => ({ pubkey, isSigner, isWritable: true });
const r = (pubkey: PublicKey, isSigner = false): AccountMeta => ({ pubkey, isSigner, isWritable: false });

export class LeverageClient {
  constructor(readonly programId: PublicKey) {}

  // ---------- PDAs ----------
  pda(seeds: Buffer[]) {
    return PublicKey.findProgramAddressSync(seeds, this.programId)[0];
  }
  get global() {
    return this.pda([Buffer.from("global")]);
  }
  get vault() {
    return this.pda([Buffer.from("vault")]);
  }
  market(mint: PublicKey) {
    return this.pda([Buffer.from("market"), mint.toBuffer()]);
  }
  position(market: PublicKey, owner: PublicKey, nonce: bigint) {
    return this.pda([Buffer.from("pos"), market.toBuffer(), owner.toBuffer(), u64(nonce)]);
  }

  private ix(name: string, keys: AccountMeta[], args: Buffer[] = []) {
    return new TransactionInstruction({
      programId: this.programId,
      keys,
      data: Buffer.concat([ixDisc(name), ...args]),
    });
  }

  // ---------- instructions ----------
  initialize(admin: PublicKey, solUsdE6: bigint) {
    return this.ix("initialize", [w(admin, true), w(this.global), w(this.vault), r(SystemProgram.programId)], [u64(solUsdE6)]);
  }
  setParams(admin: PublicKey, solUsdE6: bigint, paused: boolean, keeper: PublicKey) {
    return this.ix("set_params", [r(admin, true), w(this.global)], [u64(solUsdE6), bool(paused), key(keeper)]);
  }
  createMarket(keeper: PublicKey, mint: PublicKey, pool: PublicKey, poolKind: number, launchedAt: bigint) {
    return this.ix(
      "create_market",
      [w(keeper, true), r(this.global), r(mint), r(pool), w(this.market(mint)), r(SystemProgram.programId)],
      [u8(poolKind), i64(launchedAt)],
    );
  }
  setMarket(keeper: PublicKey, mint: PublicKey, pool: PublicKey, enabled: boolean, poolKind: number) {
    return this.ix("set_market", [r(keeper, true), r(this.global), w(this.market(mint)), r(pool)], [bool(enabled), u8(poolKind)]);
  }
  updatePrice(mint: PublicKey, pool: PublicKey) {
    return this.ix("update_price", [w(this.market(mint)), r(pool)]);
  }
  openPosition(owner: PublicKey, mint: PublicKey, nonce: bigint, long: boolean, margin: bigint, leverage: number) {
    const market = this.market(mint);
    return this.ix(
      "open_position",
      [w(owner, true), r(this.global), w(this.vault), w(market), w(this.position(market, owner, nonce)), r(SystemProgram.programId)],
      [u64(nonce), bool(long), u64(margin), u8(leverage)],
    );
  }
  closePosition(owner: PublicKey, mint: PublicKey, nonce: bigint) {
    const market = this.market(mint);
    return this.ix("close_position", [w(owner, true), w(this.vault), w(market), w(this.position(market, owner, nonce))]);
  }
  /** Stop loss / take profit as coin market cap in whole USD (0 = off). */
  setTriggers(owner: PublicKey, mint: PublicKey, nonce: bigint, slMcapUsd: bigint, tpMcapUsd: bigint) {
    const market = this.market(mint);
    return this.ix("set_triggers", [r(owner, true), w(this.position(market, owner, nonce))], [u64(slMcapUsd), u64(tpMcapUsd)]);
  }
  triggerClose(caller: PublicKey, owner: PublicKey, mint: PublicKey, nonce: bigint) {
    const market = this.market(mint);
    return this.ix("trigger_close", [
      r(caller, true),
      w(owner),
      r(this.global),
      w(this.vault),
      w(market),
      w(this.position(market, owner, nonce)),
    ]);
  }
  liquidate(liquidator: PublicKey, owner: PublicKey, mint: PublicKey, nonce: bigint) {
    const market = this.market(mint);
    return this.ix("liquidate", [
      w(liquidator, true),
      w(owner),
      w(this.vault),
      w(market),
      w(this.position(market, owner, nonce)),
    ]);
  }
}

// ---------- account decoding ----------
class Reader {
  o = 8; // skip discriminator
  constructor(private b: Buffer) {}
  u8() { return this.b.readUInt8(this.o++); }
  bool() { return this.u8() === 1; }
  u16() { const v = this.b.readUInt16LE(this.o); this.o += 2; return v; }
  u64() { const v = this.b.readBigUInt64LE(this.o); this.o += 8; return v; }
  i64() { const v = this.b.readBigInt64LE(this.o); this.o += 8; return v; }
  u128() { const lo = this.u64(); const hi = this.u64(); return (hi << 64n) | lo; }
  key() { const k = new PublicKey(this.b.subarray(this.o, this.o + 32)); this.o += 32; return k; }
}

export function decodeVault(data: Buffer) {
  const r = new Reader(data);
  return { lockedMargin: r.u64(), degenOi: r.u64() };
}

export function decodeMarket(data: Buffer) {
  const r = new Reader(data);
  const m = {
    mint: r.key(),
    pool: r.key(),
    poolKind: r.u8(),
    supply: r.u64(),
    launchedAt: r.i64(),
    enabled: r.bool(),
    poolSol: r.u64(),
    oiLong: r.u64(),
    oiShort: r.u64(),
    obs: [] as { ts: bigint; price: bigint }[],
    obsIdx: 0,
  };
  for (let i = 0; i < 32; i++) m.obs.push({ ts: r.i64(), price: r.u128() });
  m.obsIdx = r.u16();
  return m;
}

export function decodePosition(data: Buffer) {
  const r = new Reader(data);
  return {
    owner: r.key(),
    market: r.key(),
    nonce: r.u64(),
    long: r.bool(),
    margin: r.u64(),
    notional: r.u64(),
    entryPrice: r.u128(),
    openedAt: r.i64(),
    tier: r.u8(),
    bump: r.u8(),
    slMcapUsd: r.u64(),
    tpMcapUsd: r.u64(),
  };
}

/** Anchor custom error codes start at 6000, in enum order. */
export const ERRORS = [
  "Paused", "MarketDisabled", "TierLocked", "TooMuchLeverage", "MarginTooBig", "CapReached",
  "HoldTime", "NotLiquidatable", "StalePrice", "VaultEmpty", "BadPool", "PoolLayoutNotSet",
  "MathOverflow", "Unauthorized", "NotTriggered",
] as const;

/** Extract our program's error name from a failed transaction, if any. */
export function programError(e: unknown): string | undefined {
  const msg = String((e as Error)?.message ?? e) + JSON.stringify((e as any)?.logs ?? "");
  const m = msg.match(/custom program error: 0x([0-9a-f]+)/i) ?? msg.match(/Error Number: (\d+)/);
  if (!m) return undefined;
  const code = m[0].startsWith("custom") ? parseInt(m[1], 16) : Number(m[1]);
  return ERRORS[code - 6000] ?? `code ${code}`;
}

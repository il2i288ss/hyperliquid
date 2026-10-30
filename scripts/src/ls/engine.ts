/**
 * Bot-run long/short engine. Same rules as the on-chain program
 * (programs/leverage), executed by the keeper:
 *
 *   open    trader sends margin + open fee to the vault wallet with a memo
 *           ("obv:o:<mint>:<L|S>:<leverage>:<margin lamports>:<tp>:<sl>").
 *           The engine verifies the transaction on-chain and opens the
 *           position, or refunds it in full if any rule fails.
 *   close   trader signs a message in their wallet; the engine settles at
 *           the averaged price and pays margin ± PnL from the vault.
 *   risk    liquidations (90% loss) and take profit / stop loss, every 5 s.
 *   payouts crash-safe: every payout is saved before it is sent and is
 *           re-sent only once its previous attempt has provably expired.
 *
 * Positions never buy or sell the coin, so they never move the chart.
 */
import {
  type Connection,
  type Keypair,
  type ParsedInstruction,
  type PartiallyDecodedInstruction,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import crypto from "node:crypto";
import bs58 from "bs58";
import {
  coinOiCap,
  degenTotalCap,
  entryPrice,
  exitPrice,
  fee,
  isLiquidatable,
  mcapUsd,
  pnl,
  priceFromSqrtQ64,
  settle,
  tierFor,
  tiers,
  triggerHit,
  twap,
  type Tier,
} from "./math.js";

export const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const SUPPLY_RAW = 1_000_000_000_000_000n; // 1B tokens, 6 decimals
const DBC_SQRT_PRICE_OFFSET = 280;
const DBC_QUOTE_RESERVE_OFFSET = 240;
const OBS_KEEP_SECS = 600;
const OPEN_MAX_AGE_SECS = 180; // margin tx must be this fresh
const SIG_MAX_AGE_SECS = 300; // signed close / TP-SL messages
const VAULT_RESERVE = 10_000_000n; // 0.01 SOL kept for rent + network fees

export type Position = {
  id: string;
  owner: string;
  mint: string;
  long: boolean;
  margin: string; // lamports
  notional: string;
  entry: string; // scaled price
  openedAt: number;
  tier: number;
  sl: number; // USD market cap, 0 = off
  tp: number;
  openSig: string;
};
export type Payout = {
  id: string;
  to: string;
  lamports: string;
  reason: "close" | "refund" | "tp" | "sl" | "graduated";
  status: "queued" | "sent";
  sig?: string;
  lastValid?: number;
  createdAt: number;
};
export type Market = {
  mint: string;
  pool: string;
  launchedAt: number;
  poolSol: string;
  migrated: boolean;
  obs: { ts: number; price: string }[];
};
export type Closed = Position & { closedAt: number; payout: string; pnl: string; reason: string };
export type State = {
  positions: Record<string, Position>;
  payouts: Record<string, Payout>;
  usedSigs: Record<string, number>;
  markets: Record<string, Market>;
  history: Closed[];
  lastScanned?: string;
};

export type Store = { load(): State; save(s: State): void };

export type EngineOpts = {
  connection: Connection;
  vault: Keypair;
  store: Store;
  test?: boolean; // devnet values: short waits, small pools
  minTrackSol?: bigint; // only track prices for pools with at least this SOL
  solUsd: () => number;
  log?: (msg: string) => void;
};

const nowSec = () => Math.floor(Date.now() / 1000);
const big = (s: string) => BigInt(s);

export class Engine {
  readonly T: Tier[];
  private s: State;
  private queue: Promise<unknown> = Promise.resolve();
  private vaultLamports = 0n;
  private vaultAt = 0;

  constructor(readonly o: EngineOpts) {
    this.T = tiers(Boolean(o.test));
    this.s = o.store.load();
    this.s.positions ??= {};
    this.s.payouts ??= {};
    this.s.usedSigs ??= {};
    this.s.markets ??= {};
    this.s.history ??= [];
  }

  private log(m: string) {
    (this.o.log ?? console.log)(m);
  }

  /** Every state change runs through this queue, one at a time. */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => {});
    return run;
  }
  private save() {
    this.o.store.save(this.s);
  }

  get vaultAddress() {
    return this.o.vault.publicKey;
  }

  // ---------- vault accounting ----------

  async vaultBalance(force = false) {
    if (force || Date.now() - this.vaultAt > 4_000) {
      this.vaultLamports = BigInt(await this.o.connection.getBalance(this.vaultAddress, "confirmed"));
      this.vaultAt = Date.now();
    }
    return this.vaultLamports;
  }
  private lockedMargin() {
    return Object.values(this.s.positions).reduce((a, p) => a + big(p.margin), 0n);
  }
  private owed() {
    return Object.values(this.s.payouts).reduce((a, p) => a + big(p.lamports), 0n);
  }
  /** Capital available to back positions: balance - margins - payouts owed - reserve. */
  async vaultFree(force = false) {
    const free = (await this.vaultBalance(force)) - this.lockedMargin() - this.owed() - VAULT_RESERVE;
    return free > 0n ? free : 0n;
  }
  private oi(mint: string, long: boolean) {
    return Object.values(this.s.positions)
      .filter((p) => p.mint === mint && p.long === long)
      .reduce((a, p) => a + big(p.notional), 0n);
  }
  private degenOi() {
    return Object.values(this.s.positions).filter((p) => p.tier === 0).reduce((a, p) => a + big(p.notional), 0n);
  }

  // ---------- prices ----------

  /** Register/refresh the platform's pools (call every ~60 s). */
  setPools(pools: { mint: string; pool: string; launchedAt: number; poolSol: bigint; migrated: boolean }[]) {
    return this.serial(async () => {
      for (const p of pools) {
        const m = this.s.markets[p.mint];
        if (m) Object.assign(m, { pool: p.pool, poolSol: p.poolSol.toString(), migrated: p.migrated });
        else this.s.markets[p.mint] = { mint: p.mint, pool: p.pool, launchedAt: p.launchedAt, poolSol: p.poolSol.toString(), migrated: p.migrated, obs: [] };
      }
      this.save();
    });
  }

  /** Record each live pool's price (call every ~8 s). */
  async recordPrices() {
    const live = Object.values(this.s.markets).filter((m) => !m.migrated && big(m.poolSol) >= (this.o.minTrackSol ?? 0n));
    const ts = nowSec();
    for (let i = 0; i < live.length; i += 100) {
      const batch = live.slice(i, i + 100);
      const infos = await this.o.connection.getMultipleAccountsInfo(batch.map((m) => new PublicKey(m.pool)), "confirmed");
      await this.serial(async () => {
        infos.forEach((info, k) => {
          if (!info || info.data.length < DBC_SQRT_PRICE_OFFSET + 16) return;
          const d = info.data;
          const sqrt = d.readBigUInt64LE(DBC_SQRT_PRICE_OFFSET) | (d.readBigUInt64LE(DBC_SQRT_PRICE_OFFSET + 8) << 64n);
          const m = this.s.markets[batch[k].mint];
          m.poolSol = d.readBigUInt64LE(DBC_QUOTE_RESERVE_OFFSET).toString();
          m.obs.push({ ts, price: priceFromSqrtQ64(sqrt).toString() });
          m.obs = m.obs.filter((o) => o.ts > ts - OBS_KEEP_SECS);
        });
        this.save();
      });
    }
  }

  private twapOf(m: Market, window: number) {
    return twap(m.obs.map((o) => ({ ts: o.ts, price: big(o.price) })), nowSec(), window);
  }
  /** The coin's tier, from its 3-minute average market cap (same as the program). */
  private tierOf(m: Market) {
    const p = this.twapOf(m, this.T[0].twapSecs);
    return p === null ? null : { tier: tierFor(this.T, mcapUsd(p, SUPPLY_RAW, this.o.solUsd())), price: p };
  }
  private enabled(m: Market | undefined): m is Market {
    return Boolean(m && !m.migrated && this.twapOf(m, this.T[0].twapSecs) !== null);
  }

  // ---------- open ----------

  /** Process a margin transaction (from the website, or found by the scanner). */
  open(sig: string) {
    return this.serial(async () => {
      if (this.s.usedSigs[sig]) return { ok: true as const, already: true, position: Object.values(this.s.positions).find((p) => p.openSig === sig) };
      const tx = await this.o.connection.getParsedTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
      if (!tx) return { ok: false as const, retry: true, error: "Transaction not found yet" };
      if (tx.meta?.err) {
        this.s.usedSigs[sig] = nowSec();
        this.save();
        return { ok: false as const, error: "Transaction failed on-chain" };
      }
      const ixs = tx.transaction.message.instructions as (ParsedInstruction | PartiallyDecodedInstruction)[];
      const vault = this.vaultAddress.toBase58();
      let from = "";
      let paid = 0n;
      let memo = "";
      for (const ix of ixs) {
        if ("parsed" in ix && ix.program === "system" && ix.parsed?.type === "transfer" && ix.parsed.info.destination === vault) {
          from = ix.parsed.info.source;
          paid += BigInt(ix.parsed.info.lamports);
        } else if (ix.programId.equals(MEMO_PROGRAM)) {
          memo = "parsed" in ix ? String(ix.parsed) : Buffer.from(bs58.decode((ix as PartiallyDecodedInstruction).data)).toString("utf8");
        }
      }
      if (!memo.startsWith("obv:o:") || paid === 0n) return { ok: false as const, error: "Not a long/short transaction" };
      this.s.usedSigs[sig] = nowSec();

      const reject = (error: string) => {
        if (from) this.queuePayout(`refund:${sig}`, from, paid, "refund");
        this.save();
        this.log(`[ls] refused ${sig.slice(0, 8)} from ${from.slice(0, 6)}: ${error} (refunding ${Number(paid) / 1e9} SOL)`);
        return { ok: false as const, refunded: true, error };
      };

      const [, , mint, side, levS, marginS, tpS, slS] = memo.split(":");
      const leverage = Number(levS);
      let margin: bigint;
      try {
        margin = BigInt(marginS);
      } catch {
        return reject("Bad memo");
      }
      if (!from || (side !== "L" && side !== "S") || !Number.isInteger(leverage) || margin <= 0n) return reject("Bad memo");
      if (!tx.blockTime || nowSec() - tx.blockTime > OPEN_MAX_AGE_SECS) return reject("Transaction too old");

      const m = this.s.markets[mint];
      if (!this.enabled(m)) return reject("Long/short isn't live on this coin yet");
      const t = this.tierOf(m)!;
      const tier = t.tier;
      if (tier.id === 0) {
        if (big(m.poolSol) < tier.minPoolSol || nowSec() - m.launchedAt < tier.minAgeSecs) return reject("This coin hasn't unlocked long/short yet");
      }
      if (leverage < 1 || leverage > tier.leverage) return reject("Leverage above this coin's tier");
      if (margin > tier.maxMargin) return reject("Margin above this coin's limit");
      const notional = margin * BigInt(leverage);
      const openFee = fee(notional, tier.feeBps);
      if (paid < margin + openFee) return reject("Payment doesn't cover margin + fee");

      // Capacity is checked against the vault before this payment arrived.
      const free = (await this.vaultFree(true)) - paid;
      const long = side === "L";
      const cap = coinOiCap(tier, big(m.poolSol), free > 0n ? free : 0n);
      if (this.oi(mint, long) + notional > cap) return reject("Long/short capacity for this coin is full");
      if (tier.id === 0 && this.degenOi() + notional > degenTotalCap(free > 0n ? free : 0n)) return reject("Capacity for new coins is full");

      const spot = this.twapOf(m, tier.twapSecs);
      if (spot === null) return reject("Not enough price history yet");
      const overpaid = paid - margin - openFee;
      if (overpaid > 100_000n) this.queuePayout(`over:${sig}`, from, overpaid, "refund");

      const id = crypto.createHash("sha256").update(sig).digest("hex").slice(0, 16);
      const p: Position = {
        id,
        owner: from,
        mint,
        long,
        margin: margin.toString(),
        notional: notional.toString(),
        entry: entryPrice(long, spot, notional, big(m.poolSol)).toString(),
        openedAt: tx.blockTime,
        tier: tier.id,
        tp: Math.max(0, Math.round(Number(tpS) || 0)),
        sl: Math.max(0, Math.round(Number(slS) || 0)),
        openSig: sig,
      };
      this.s.positions[id] = p;
      this.save();
      this.log(`[ls] opened ${long ? "long" : "short"} ${leverage}x ${Number(notional) / 1e9} SOL on ${mint.slice(0, 6)} for ${from.slice(0, 6)}`);
      return { ok: true as const, position: p };
    });
  }

  /** Find margin transactions the website didn't report (closed tab etc.). */
  async scan() {
    const sigs = await this.o.connection.getSignaturesForAddress(this.vaultAddress, { limit: 100 }, "confirmed");
    for (const s of sigs.reverse()) {
      if (s.err || this.s.usedSigs[s.signature]) continue;
      if (!s.memo?.includes("obv:o:")) continue;
      if (s.blockTime && nowSec() - s.blockTime > 3600) continue;
      await this.open(s.signature).catch((e) => this.log(`[ls] scan ${s.signature.slice(0, 8)}: ${(e as Error).message}`));
    }
  }

  // ---------- close / triggers ----------

  private value(p: Position) {
    const m = this.s.markets[p.mint];
    const tier = this.T[p.tier];
    const spot = m ? this.twapOf(m, tier.twapSecs) : null;
    if (spot === null) return null;
    const exit = exitPrice(p.long, spot, big(p.entry), big(p.notional), big(m.poolSol));
    const raw = pnl(p.long, big(p.notional), big(p.entry), exit);
    const payout = settle(big(p.margin), raw, tier.profitCapX, fee(big(p.notional), tier.feeBps));
    return { raw, payout, spot, mcap: mcapUsd(spot, SUPPLY_RAW, this.o.solUsd()) };
  }

  private finish(p: Position, payout: bigint, raw: bigint, reason: Payout["reason"] | "liquidated") {
    delete this.s.positions[p.id];
    if (payout > 0n) this.queuePayout(`pay:${p.id}`, p.owner, payout, reason === "liquidated" ? "close" : reason);
    this.s.history.unshift({ ...p, closedAt: nowSec(), payout: payout.toString(), pnl: raw.toString(), reason });
    this.s.history = this.s.history.slice(0, 500);
    this.save();
    this.log(`[ls] ${reason} ${p.long ? "long" : "short"} ${p.id} on ${p.mint.slice(0, 6)}: pays ${Number(payout) / 1e9} SOL`);
  }

  /** Checks a wallet-signed message: "Obverse: <action> <id> at <unix>". */
  private verify(owner: string, message: string, signature: string, expect: RegExp) {
    const m = message.match(expect);
    if (!m) throw new Error("Bad message");
    const ts = Number(message.match(/ at (\d+)$/)?.[1]);
    if (!ts || Math.abs(nowSec() - ts) > SIG_MAX_AGE_SECS) throw new Error("Signature expired, try again");
    const key = crypto.createPublicKey({
      key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), new PublicKey(owner).toBuffer()]),
      format: "der",
      type: "spki",
    });
    if (!crypto.verify(null, Buffer.from(message, "utf8"), key, Buffer.from(bs58.decode(signature)))) throw new Error("Bad signature");
    return m;
  }

  close(owner: string, id: string, message: string, signature: string) {
    return this.serial(async () => {
      this.verify(owner, message, signature, new RegExp(`^Obverse: close ${id} at \\d+$`));
      const p = this.s.positions[id];
      if (!p || p.owner !== owner) throw new Error("Position not found");
      const hold = this.T[p.tier].minHoldSecs;
      if (nowSec() - p.openedAt < hold) throw new Error(`Hold for at least ${hold} s before closing`);
      const v = this.value(p);
      if (!v) throw new Error("Not enough price history yet");
      this.finish(p, v.payout, v.raw, "close");
      return { payout: v.payout.toString(), pnl: v.raw.toString() };
    });
  }

  setTriggers(owner: string, id: string, tp: number, sl: number, message: string, signature: string) {
    return this.serial(async () => {
      this.verify(owner, message, signature, new RegExp(`^Obverse: set TP ${tp} SL ${sl} on ${id} at \\d+$`));
      const p = this.s.positions[id];
      if (!p || p.owner !== owner) throw new Error("Position not found");
      p.tp = Math.max(0, Math.round(tp));
      p.sl = Math.max(0, Math.round(sl));
      this.save();
      return p;
    });
  }

  /** Liquidations, take profit / stop loss, graduated coins (every ~5 s). */
  risk() {
    return this.serial(async () => {
      const now = nowSec();
      for (const p of Object.values(this.s.positions)) {
        const m = this.s.markets[p.mint];
        const v = this.value(p);
        if (!v) continue;
        if (m?.migrated) {
          this.finish(p, v.payout, v.raw, "graduated");
        } else if (isLiquidatable(big(p.margin), v.raw)) {
          this.finish(p, 0n, v.raw, "liquidated");
        } else if (now - p.openedAt >= this.T[p.tier].minHoldSecs) {
          const hit = triggerHit(p.long, v.mcap, p.sl, p.tp);
          if (hit !== "none") this.finish(p, v.payout, v.raw, hit);
        }
      }
    });
  }

  // ---------- payouts ----------

  private queuePayout(id: string, to: string, lamports: bigint, reason: Payout["reason"]) {
    if (this.s.payouts[id] || lamports <= 0n) return;
    this.s.payouts[id] = { id, to, lamports: lamports.toString(), reason, status: "queued", createdAt: nowSec() };
  }

  /** Send queued payouts; confirm or safely retry sent ones (every ~3 s). */
  payouts() {
    return this.serial(async () => {
      const c = this.o.connection;
      const height = await c.getBlockHeight("confirmed");
      for (const p of Object.values(this.s.payouts)) {
        if (p.status === "sent" && p.sig) {
          const st = (await c.getSignatureStatuses([p.sig], { searchTransactionHistory: true })).value[0];
          if (st && !st.err && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) {
            delete this.s.payouts[p.id];
            this.save();
            continue;
          }
          if (st?.err || (!st && height > (p.lastValid ?? 0))) {
            // Provably not landed: try again with a fresh transaction.
            p.status = "queued";
            delete p.sig;
            this.save();
          } else continue;
        }
        const bal = await this.vaultBalance(true);
        if (bal < big(p.lamports) + 1_000_000n) {
          this.log(`[ls] vault too low for payout ${p.id} (${Number(p.lamports) / 1e9} SOL)`);
          continue;
        }
        const { blockhash, lastValidBlockHeight } = await c.getLatestBlockhash("confirmed");
        const tx = new Transaction({ feePayer: this.vaultAddress, blockhash, lastValidBlockHeight }).add(
          SystemProgram.transfer({ fromPubkey: this.vaultAddress, toPubkey: new PublicKey(p.to), lamports: big(p.lamports) }),
        );
        tx.sign(this.o.vault);
        p.sig = bs58.encode(tx.signature!);
        p.lastValid = lastValidBlockHeight;
        p.status = "sent";
        this.save(); // saved BEFORE sending: a crash can never pay twice
        await c.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 5 }).catch((e) => this.log(`[ls] send ${p.id}: ${(e as Error).message}`));
        this.vaultAt = 0;
      }
    });
  }

  // ---------- read model for the website ----------

  async view(mint?: string, owner?: string) {
    const vaultTotal = (await this.vaultBalance()) - VAULT_RESERVE;
    const vaultFree = await this.vaultFree();
    const m = mint ? this.s.markets[mint] : undefined;
    let market = null;
    if (m) {
      const t = this.tierOf(m);
      const tier = t?.tier;
      const capacity = tier ? coinOiCap(tier, big(m.poolSol), vaultFree) : 0n;
      market = {
        enabled: this.enabled(m),
        poolSol: Number(m.poolSol) / 1e9,
        oiLong: Number(this.oi(m.mint, true)) / 1e9,
        oiShort: Number(this.oi(m.mint, false)) / 1e9,
        capacity: Number(capacity) / 1e9,
        launchedAt: m.launchedAt,
        tier: tier?.id ?? null,
        mcapUsd: t ? mcapUsd(t.price, SUPPLY_RAW, this.o.solUsd()) : null,
      };
    }
    const positions = Object.values(this.s.positions)
      .filter((p) => (!owner || p.owner === owner) && (!mint || p.mint === mint))
      .map((p) => {
        const v = this.value(p);
        return { ...p, estPayout: v ? Number(v.payout) / 1e9 : null, estPnl: v ? Number(v.raw) / 1e9 : null };
      });
    return {
      mode: "bot",
      test: Boolean(this.o.test),
      vault: this.vaultAddress.toBase58(),
      vaultTotal: Number(vaultTotal > 0n ? vaultTotal : 0n) / 1e9,
      vaultFree: Number(vaultFree) / 1e9,
      solUsd: this.o.solUsd(),
      market,
      positions,
      tiers: this.T.map((t) => ({ id: t.id, leverage: t.leverage, maxMargin: Number(t.maxMargin) / 1e9, feeBps: Number(t.feeBps), minHoldSecs: t.minHoldSecs })),
    };
  }

  liveMints() {
    return Object.values(this.s.markets).filter((m) => this.enabled(m)).map((m) => m.mint);
  }
  history(owner?: string) {
    return this.s.history.filter((h) => !owner || h.owner === owner).slice(0, 100);
  }
  pendingPayouts() {
    return Object.values(this.s.payouts);
  }
}

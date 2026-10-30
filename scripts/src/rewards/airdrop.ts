/**
 * Pays holders their SOL. For each coin: averages the snapshots taken since
 * the last payout, splits that coin's holder pot pro-rata, and sends SOL in
 * batched transactions from the holder pot wallet.
 *
 *   npx tsx src/rewards/airdrop.ts          (run every 15 minutes)
 *   npx tsx src/rewards/airdrop.ts --dry    (print, send nothing)
 */
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { connection, loadKeypair } from "../env.js";
import { allocate, averageBalances, type Balances } from "./allocate.js";
import { read, write, type Ledger } from "./store.js";

const MIN_PAYOUT = 1_000_000n; // 0.001 SOL; smaller amounts carry over
const PER_TX = 18; // transfers per transaction

type Snap = { ts: number; balances: Record<string, string> };
const toMap = (r: Record<string, string>): Balances =>
  new Map(Object.entries(r).map(([k, v]) => [k, BigInt(v)]));

export async function payHolders(dry = process.argv.includes("--dry")) {
  const pot = loadKeypair("HOLDER_POT_KEYPAIR");
  const ledger = read<Ledger>("ledger.json", {});

  for (const [mint, { holdersDue }] of Object.entries(ledger)) {
    const due = BigInt(holdersDue);
    const snaps = read<Snap[]>(`snapshots-${mint}.json`, []);
    if (due === 0n || snaps.length === 0) continue;

    // A "round" is saved before sending, so a crash halfway resumes where it
    // stopped instead of paying the first batches twice.
    type Round = { payouts: [string, string][]; sent: number; allocated: string; carry: Record<string, string> };
    let round = read<Round | null>(`round-${mint}.json`, null);
    if (!round) {
      const avg = averageBalances(snaps.map((s) => toMap(s.balances)));
      const carry = toMap(read<Record<string, string>>(`carry-${mint}.json`, {}));
      const r = allocate(due, avg, carry, MIN_PAYOUT);
      round = {
        payouts: [...r.payouts].map(([k, v]) => [k, v.toString()]),
        sent: 0,
        allocated: r.allocated.toString(),
        carry: Object.fromEntries([...r.carry].map(([k, v]) => [k, v.toString()])),
      };
    }
    const total = round.payouts.reduce((a, [, v]) => a + BigInt(v), 0n);
    console.log(`${mint}: ${round.payouts.length} holders, ${(Number(total) / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    if (dry) continue;
    write(`round-${mint}.json`, round);

    while (round.sent < round.payouts.length) {
      const tx = new Transaction();
      for (const [w, lamports] of round.payouts.slice(round.sent, round.sent + PER_TX)) {
        tx.add(SystemProgram.transfer({ fromPubkey: pot.publicKey, toPubkey: new PublicKey(w), lamports: BigInt(lamports) }));
      }
      await sendAndConfirmTransaction(connection, tx, [pot]);
      round.sent = Math.min(round.sent + PER_TX, round.payouts.length);
      write(`round-${mint}.json`, round);
    }

    // Round finished: update the books and clear it.
    ledger[mint] = { holdersDue: (due - BigInt(round.allocated)).toString() };
    write("ledger.json", ledger);
    write(`carry-${mint}.json`, round.carry);
    write(`snapshots-${mint}.json`, []);
    write(`round-${mint}.json`, null);
  }
}

if (process.argv[1]?.endsWith("airdrop.ts")) {
  payHolders().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

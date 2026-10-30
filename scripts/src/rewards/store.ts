// Tiny JSON-file store. Swap for Postgres when you outgrow it.
import fs from "node:fs";
import path from "node:path";

const DIR = process.env.DATA_DIR ?? "data";

function file(name: string) {
  fs.mkdirSync(DIR, { recursive: true });
  return path.join(DIR, name);
}

export function read<T>(name: string, fallback: T): T {
  const f = file(name);
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, "utf8")) as T) : fallback;
}

export function write(name: string, value: unknown) {
  const f = file(name);
  fs.writeFileSync(f + ".tmp", JSON.stringify(value, null, 1));
  fs.renameSync(f + ".tmp", f); // atomic replace
}

/** Per-coin SOL owed to holders (lamports, as strings for JSON). */
export type Ledger = Record<string, { holdersDue: string }>;

/** Launch fees sitting in the splitter wallet; they go 100% to treasury. */
export function addLaunchFees(lamports: bigint) {
  const s = read<{ launchFees: string }>("launch-fees.json", { launchFees: "0" });
  write("launch-fees.json", { launchFees: (BigInt(s.launchFees) + lamports).toString() });
}
export function peekLaunchFees(): bigint {
  return BigInt(read<{ launchFees: string }>("launch-fees.json", { launchFees: "0" }).launchFees);
}
/** Call only after the split transaction confirmed. */
export function consumeLaunchFees(used: bigint) {
  write("launch-fees.json", { launchFees: (peekLaunchFees() - used).toString() });
}

export function addHoldersDue(mint: string, lamports: bigint) {
  const ledger = read<Ledger>("ledger.json", {});
  const prev = BigInt(ledger[mint]?.holdersDue ?? "0");
  ledger[mint] = { holdersDue: (prev + lamports).toString() };
  write("ledger.json", ledger);
}

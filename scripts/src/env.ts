import "dotenv/config";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { DynamicBondingCurveClient } from "@meteora-ag/dynamic-bonding-curve-sdk";
import bs58 from "bs58";
import fs from "node:fs";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in .env (see .env.example)`);
  return v;
}

/** Load a keypair from a base58 secret or a Solana CLI JSON file path. */
export function loadKeypair(envName: string): Keypair {
  const v = required(envName);
  if (v.trim().startsWith("[") || v.endsWith(".json")) {
    const raw = v.endsWith(".json") ? fs.readFileSync(v, "utf8") : v;
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
  }
  return Keypair.fromSecretKey(bs58.decode(v));
}

export const connection = new Connection(required("RPC_URL"), "confirmed");
export const dbc = DynamicBondingCurveClient.create(connection, "confirmed");

export const pubkey = (name: string) => new PublicKey(required(name));
/** An address from the env, or the given default. */
export const pubkeyOr = (name: string, fallback: string) => new PublicKey(process.env[name] || fallback);
export const optionalPubkey = (name: string) =>
  process.env[name] ? new PublicKey(process.env[name]!) : undefined;

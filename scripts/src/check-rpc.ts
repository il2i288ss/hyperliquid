/** Fails unless RPC_URL answers as a Solana MAINNET endpoint. */
import { Connection } from "@solana/web3.js";

const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
try {
  const c = new Connection(process.env.RPC_URL!, "confirmed");
  const genesis = await c.getGenesisHash();
  if (genesis !== MAINNET_GENESIS) {
    console.log("That RPC URL works, but it is not MAINNET (it's devnet or testnet).");
    process.exit(1);
  }
  console.log(`RPC OK (mainnet, slot ${await c.getSlot()})`);
} catch (e) {
  console.log(`RPC error: ${(e as Error).message.split("\n")[0]}`);
  process.exit(1);
}

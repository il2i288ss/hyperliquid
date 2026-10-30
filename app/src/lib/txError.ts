import { NETWORK } from "./config";

/** Turn common wallet / RPC failures into plain messages. */
export function txError(e: unknown): string {
  const msg = String((e as Error)?.message ?? e);
  if (/User rejected/i.test(msg)) return "Cancelled in wallet.";
  if (/no record of a prior credit|insufficient (funds|lamports)|0x1\b/i.test(msg)) {
    return NETWORK === "devnet"
      ? "Your wallet doesn't have enough SOL on devnet. Get free devnet SOL at faucet.solana.com, and make sure your wallet is set to devnet."
      : "Your wallet doesn't have enough SOL for this.";
  }
  if (/slippage|0x1771|exceeded/i.test(msg)) return "Price moved too much. Try again or raise slippage.";
  if (/blockhash not found|block height exceeded/i.test(msg)) return "The network was slow. Please try again.";
  return msg.split("\n")[0].slice(0, 200);
}

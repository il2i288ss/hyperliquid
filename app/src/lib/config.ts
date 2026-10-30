import { PublicKey } from "@solana/web3.js";

/** Public settings, from the deployment's environment variables. */
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";
export const NETWORK = process.env.NEXT_PUBLIC_NETWORK === "mainnet-beta" ? "mainnet-beta" : "devnet";
export const DBC_CONFIG = new PublicKey(
  process.env.NEXT_PUBLIC_DBC_CONFIG ?? "So11111111111111111111111111111111111111112",
);
export const LEVERAGE_PROGRAM = new PublicKey(
  process.env.NEXT_PUBLIC_LEVERAGE_PROGRAM ?? "F2vF7Xo4huUnhutSoyCLSLAfzyDdg9bAXeJb6M7RN9jH",
);
/** Used only when the long/short program has no SOL/USD rate set yet. */
export const FALLBACK_SOL_USD = Number(process.env.NEXT_PUBLIC_SOL_USD ?? "150");

export const BRAND = process.env.NEXT_PUBLIC_BRAND ?? "LAUNCHPAD";

export const LAUNCH_FEE_SOL = 0.03;
/** Measured on devnet: rent + network fees for a launch. */
export const LAUNCH_RENT_SOL = 0.025;
export const TOTAL_SUPPLY = 1_000_000_000;
export const TOKEN_DECIMALS = 6;

export const explorer = (kind: "address" | "tx", id: string) =>
  `https://solscan.io/${kind}/${id}${NETWORK === "devnet" ? "?cluster=devnet" : ""}`;

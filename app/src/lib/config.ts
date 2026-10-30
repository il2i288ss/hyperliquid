import { PublicKey } from "@solana/web3.js";

/** Public settings, from the deployment's environment variables. */
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";
export const NETWORK = process.env.NEXT_PUBLIC_NETWORK === "mainnet-beta" ? "mainnet-beta" : "devnet";
// Default: the stable devnet platform config (devnet-state/platform.json).
export const DBC_CONFIG = new PublicKey(
  process.env.NEXT_PUBLIC_DBC_CONFIG ?? "2vXECqjW5vLPD4cvunQujy3jU5YfxrTEBmfJUNjFjYY9",
);
export const LEVERAGE_PROGRAM = new PublicKey(
  process.env.NEXT_PUBLIC_LEVERAGE_PROGRAM ?? "CVa7fiyDKgrE1EHxcgLPNJv69Yj5hLSfnfu1XhhhuR2x",
);
/** Bot-run long/short API (the keeper on Railway). When set, long/short runs through it. */
export const LS_API = (process.env.NEXT_PUBLIC_LS_API ?? "").replace(/\/$/, "");
/** Vault wallet of the bot-run engine (shown in the docs). */
export const LS_VAULT = process.env.NEXT_PUBLIC_LS_VAULT ?? "8o3aPx6YiuGxx61hCmDCMfJLYzt6kcnhg8hFk1eBtTff";
/** "bot" = run by the keeper (no on-chain program); "chain" = the on-chain program. */
export const LEVERAGE_MODE: "bot" | "chain" = LS_API ? "bot" : "chain";
/** Long/short trading on the site. */
export const LEVERAGE_ENABLED =
  Boolean(LS_API) || (process.env.NEXT_PUBLIC_LEVERAGE ?? (process.env.NEXT_PUBLIC_NETWORK === "mainnet-beta" ? "off" : "on")) === "on";
/** Used only when the long/short program has no SOL/USD rate set yet. */
export const FALLBACK_SOL_USD = Number(process.env.NEXT_PUBLIC_SOL_USD ?? "150");

export const BRAND = process.env.NEXT_PUBLIC_BRAND ?? "Obverse";
export const TAGLINE = "Every coin has two sides.";

export const LAUNCH_FEE_SOL = 0.03;
/** Measured on devnet: rent + network fees for a launch. */
export const LAUNCH_RENT_SOL = 0.025;
export const TOTAL_SUPPLY = 1_000_000_000;
export const TOKEN_DECIMALS = 6;

export const explorer = (kind: "address" | "tx", id: string) =>
  `https://solscan.io/${kind}/${id}${NETWORK === "devnet" ? "?cluster=devnet" : ""}`;

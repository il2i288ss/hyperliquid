"use client";

import { useCallback, useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LEVERAGE_ENABLED } from "./config";
import {
  decodeGlobal,
  decodeMarket,
  decodeVault,
  fetchPositions,
  globalPda,
  marketPda,
  vaultPda,
  type GlobalState,
  type MarketState,
  type Position,
} from "./leverage";

export type LeverageState = {
  global: GlobalState | null;
  market: MarketState | null;
  /** SOL in the vault available to back positions. */
  vaultFree: number;
  vaultTotal: number;
  positions: Position[];
  loaded: boolean;
};

/** Live long/short state for one coin, refreshed every 8 s. */
export function useLeverage(mint: string) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [state, setState] = useState<LeverageState>({
    global: null, market: null, vaultFree: 0, vaultTotal: 0, positions: [], loaded: false,
  });

  const refresh = useCallback(async () => {
    const mintKey = new PublicKey(mint);
    const market = marketPda(mintKey);
    const [g, m, v] = await connection.getMultipleAccountsInfo([globalPda(), market, vaultPda()]);
    let vaultFree = 0;
    let vaultTotal = 0;
    if (v) {
      const rent = await connection.getMinimumBalanceForRentExemption(v.data.length);
      const locked = Number(decodeVault(v.data as Buffer).lockedMargin) / 1e9;
      vaultTotal = (v.lamports - rent) / 1e9;
      vaultFree = Math.max(0, vaultTotal - locked);
    }
    const positions = publicKey
      ? (await fetchPositions(connection, publicKey)).filter((p) => p.market.equals(market))
      : [];
    setState({
      global: g ? decodeGlobal(g.data as Buffer) : null,
      market: m ? decodeMarket(m.data as Buffer) : null,
      vaultFree,
      vaultTotal,
      positions,
      loaded: true,
    });
  }, [connection, publicKey, mint]);

  useEffect(() => {
    if (!LEVERAGE_ENABLED) return;
    refresh().catch(() => {});
    const t = setInterval(() => refresh().catch(() => {}), 8_000);
    return () => clearInterval(t);
  }, [refresh]);

  return { ...state, refresh };
}

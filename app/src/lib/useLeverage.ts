"use client";

import { useCallback, useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LEVERAGE_ENABLED, LEVERAGE_MODE, LS_API } from "./config";
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
  market: (MarketState & { capacity?: number }) | null;
  /** SOL in the vault available to back positions. */
  vaultFree: number;
  vaultTotal: number;
  vaultAddress: string;
  positions: Position[];
  loaded: boolean;
  mode: "bot" | "chain";
};

/** Bot-run engine (keeper API): same shape as the on-chain state. */
async function loadBot(mint: string, owner?: string): Promise<Omit<LeverageState, "loaded">> {
  const q = new URLSearchParams({ mint, ...(owner ? { owner } : {}) });
  const r = await fetch(`${LS_API}/ls/state?${q}`, { cache: "no-store" });
  const v = await r.json();
  if (!r.ok) throw new Error(v.error ?? "Long/short is unavailable");
  const mintKey = new PublicKey(mint);
  const market = v.market
    ? {
        mint: mintKey,
        pool: mintKey,
        poolKind: 0,
        supply: 1_000_000_000_000_000n,
        launchedAt: v.market.launchedAt,
        enabled: v.market.enabled,
        poolSol: v.market.poolSol,
        oiLong: v.market.oiLong,
        oiShort: v.market.oiShort,
        capacity: v.market.capacity,
      }
    : null;
  const positions: Position[] = (v.positions ?? []).map((p: any) => ({
    id: p.id,
    owner: new PublicKey(p.owner),
    market: mintKey,
    nonce: 0n,
    long: p.long,
    margin: Number(p.margin) / 1e9,
    notional: Number(p.notional) / 1e9,
    entryPrice: Number(p.entry) / 1e12,
    openedAt: p.openedAt,
    tier: p.tier,
    slMcapUsd: p.sl,
    tpMcapUsd: p.tp,
    address: mintKey,
    estPayout: p.estPayout,
  }));
  return {
    global: { solUsd: v.solUsd, paused: false, testBuild: v.test },
    market,
    vaultFree: v.vaultFree,
    vaultTotal: v.vaultTotal,
    vaultAddress: v.vault,
    positions,
    mode: "bot",
  };
}

/** Live long/short state for one coin, refreshed every 5–8 s. */
export function useLeverage(mint: string) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [state, setState] = useState<LeverageState>({
    global: null, market: null, vaultFree: 0, vaultTotal: 0, vaultAddress: "", positions: [], loaded: false, mode: LEVERAGE_MODE,
  });

  const refresh = useCallback(async () => {
    if (LEVERAGE_MODE === "bot") {
      const s = await loadBot(mint, publicKey?.toBase58());
      setState({ ...s, loaded: true });
      return;
    }
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
      vaultAddress: vaultPda().toBase58(),
      positions,
      loaded: true,
      mode: "chain",
    });
  }, [connection, publicKey, mint]);

  useEffect(() => {
    if (!LEVERAGE_ENABLED) return;
    refresh().catch(() => setState((s) => ({ ...s, loaded: true })));
    const t = setInterval(() => refresh().catch(() => {}), LEVERAGE_MODE === "bot" ? 5_000 : 8_000);
    return () => clearInterval(t);
  }, [refresh]);

  return { ...state, refresh };
}

"use client";

import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useConnection } from "@solana/wallet-adapter-react";
import { decodePoolLive } from "./pool";

/**
 * The pool's price the moment it changes on-chain: subscribes to the pool
 * account over the RPC websocket and decodes the price from its bytes.
 * Calls onChange after every update (used to pull the new trade right away).
 */
export function useLivePool(pool: string | undefined, onChange?: () => void) {
  const { connection } = useConnection();
  const [live, setLive] = useState<{ priceSol: number; quoteSol: number; at: number } | null>(null);
  useEffect(() => {
    if (!pool) return;
    let key: PublicKey;
    try {
      key = new PublicKey(pool);
    } catch {
      return;
    }
    let alive = true;
    const apply = (data: Uint8Array) => {
      try {
        const v = decodePoolLive(data);
        if (alive && v.priceSol > 0) setLive({ ...v, at: Date.now() });
      } catch {
        /* unexpected layout: fall back to polling */
      }
    };
    connection.getAccountInfo(key, "confirmed").then((i) => i && apply(i.data)).catch(() => {});
    const id = connection.onAccountChange(key, (info) => {
      apply(info.data);
      onChange?.();
    }, "confirmed");
    return () => {
      alive = false;
      connection.removeAccountChangeListener(id).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, pool]);
  return live;
}

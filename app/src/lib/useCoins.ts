"use client";

import { useEffect, useState } from "react";
import type { Coin } from "./coins";

/** Coins from /api/coins, refreshed every 10 s. */
export function useCoins() {
  const [coins, setCoins] = useState<Coin[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/coins");
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Could not load coins");
        if (alive) {
          setCoins(body.coins);
          setError("");
        }
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    };
    load();
    const t = setInterval(load, 10_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return { coins, error };
}

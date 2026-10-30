import { NextResponse } from "next/server";
import { getCoin } from "@/lib/coins";
import { recentTrades } from "@/lib/activity";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Every trade of a coin, newest first. With ?after=<signature> only trades
 * newer than that one are returned, so live updates stay tiny.
 */
export async function GET(req: Request, { params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  const after = new URL(req.url).searchParams.get("after");
  try {
    const coin = await getCoin(mint);
    if (!coin) return NextResponse.json({ error: "Coin not found" }, { status: 404 });
    const all = await recentTrades(coin.pool, coin.mint);
    if (after) {
      const i = all.findIndex((t) => t.sig === after);
      if (i >= 0) return NextResponse.json({ trades: all.slice(0, i), partial: true }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ trades: all }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

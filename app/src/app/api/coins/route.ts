import { NextResponse } from "next/server";
import { listCoins } from "@/lib/coins";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const coins = await listCoins();
    return NextResponse.json({ coins }, { headers: { "Cache-Control": "s-maxage=5, stale-while-revalidate=20" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

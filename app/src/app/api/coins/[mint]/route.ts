import { NextResponse } from "next/server";
import { getCoin } from "@/lib/coins";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  try {
    const coin = await getCoin(mint);
    if (!coin) return NextResponse.json({ error: "Coin not found on this launchpad" }, { status: 404 });
    return NextResponse.json({ coin });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

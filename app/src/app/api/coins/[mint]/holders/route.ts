import { NextResponse } from "next/server";
import { topHolders } from "@/lib/activity";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  try {
    return NextResponse.json({ holders: await topHolders(mint) }, { headers: { "Cache-Control": "s-maxage=10, stale-while-revalidate=60" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

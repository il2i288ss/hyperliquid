import { NextResponse } from "next/server";

/**
 * Coin images, served from our own domain. Pinata's free public gateway
 * refuses images embedded on other sites, so fetch the IPFS file (trying
 * several gateways) and cache it at the edge. Only IPFS CIDs are accepted,
 * so this can't be used as an open proxy.
 */
const GATEWAYS = [
  (cid: string) => `https://ipfs.io/ipfs/${cid}`,
  (cid: string) => `https://dweb.link/ipfs/${cid}`,
  (cid: string) => `https://gateway.pinata.cloud/ipfs/${cid}`,
  (cid: string) => `https://w3s.link/ipfs/${cid}`,
];
const CID = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{58,})$/;
const MAX_BYTES = 5_000_000;

export async function GET(_req: Request, { params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params;
  if (!CID.test(cid)) return NextResponse.json({ error: "bad cid" }, { status: 400 });
  for (const url of GATEWAYS) {
    try {
      const r = await fetch(url(cid), { signal: AbortSignal.timeout(6_000) });
      const type = r.headers.get("content-type") ?? "";
      if (!r.ok || !type.startsWith("image/")) continue;
      const body = await r.arrayBuffer();
      if (body.byteLength > MAX_BYTES) continue;
      return new NextResponse(body, {
        headers: {
          "Content-Type": type,
          // IPFS content never changes: cache for a year
          "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'",
        },
      });
    } catch {
      /* next gateway */
    }
  }
  return NextResponse.json({ error: "image unavailable" }, { status: 404 });
}

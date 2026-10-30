/**
 * Long/short HTTP API, served by the keeper on Railway (PORT).
 *
 *   GET  /ls/health
 *   GET  /ls/state?mint=&owner=      vault, coin capacity, your positions
 *   GET  /ls/markets                 coins with long/short live + vault size
 *   GET  /ls/history?owner=          closed positions
 *   POST /ls/open      {sig}                              after sending margin
 *   POST /ls/close     {owner,id,message,signature}       wallet-signed
 *   POST /ls/triggers  {owner,id,tp,sl,message,signature} wallet-signed
 *
 * POSTs carry their own proof (an on-chain payment or a wallet signature),
 * so CORS can be open.
 */
import http from "node:http";
import type { Engine } from "./engine.js";

const MAX_BODY = 4_096;
const hits = new Map<string, { n: number; at: number }>();

function limited(ip: string) {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.at > 10_000) {
    hits.set(ip, { n: 1, at: now });
    return false;
  }
  return ++h.n > 40;
}

export function serve(engine: Engine, port: number, log = console.log) {
  const server = http.createServer(async (req, res) => {
    const send = (code: number, body: unknown) => {
      res.writeHead(code, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
    };
    if (req.method === "OPTIONS") return send(204, {});
    const ip = String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "").split(",")[0].trim();
    if (limited(ip)) return send(429, { error: "Too many requests, slow down" });

    const url = new URL(req.url ?? "/", "http://x");
    const q = (k: string) => url.searchParams.get(k) ?? undefined;
    try {
      if (req.method === "GET") {
        if (url.pathname === "/ls/health" || url.pathname === "/") return send(200, { ok: true, payoutsPending: engine.pendingPayouts().length });
        if (url.pathname === "/ls/state") return send(200, await engine.view(q("mint"), q("owner")));
        if (url.pathname === "/ls/markets") {
          const v = await engine.view();
          return send(200, { mints: engine.liveMints(), vault: v.vault, vaultTotal: v.vaultTotal, vaultFree: v.vaultFree });
        }
        if (url.pathname === "/ls/history") return send(200, { history: engine.history(q("owner")) });
        return send(404, { error: "Not found" });
      }
      if (req.method !== "POST") return send(405, { error: "Method not allowed" });

      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > MAX_BODY) return send(413, { error: "Body too large" });
      }
      const b = JSON.parse(raw || "{}");
      const str = (k: string) => {
        if (typeof b[k] !== "string" || b[k].length > 200) throw new Error(`Missing ${k}`);
        return b[k] as string;
      };
      if (url.pathname === "/ls/open") {
        // The margin transaction may need a moment to be visible: retry briefly.
        const sig = str("sig");
        for (let i = 0; i < 8; i++) {
          const r = await engine.open(sig);
          if (!("retry" in r && r.retry)) return send(r.ok ? 200 : 400, r);
          await new Promise((s) => setTimeout(s, 1500));
        }
        return send(202, { ok: false, pending: true, error: "Still confirming. Your position will open automatically." });
      }
      if (url.pathname === "/ls/close") return send(200, await engine.close(str("owner"), str("id"), str("message"), str("signature")));
      if (url.pathname === "/ls/triggers") {
        const tp = Number(b.tp) || 0;
        const sl = Number(b.sl) || 0;
        return send(200, await engine.setTriggers(str("owner"), str("id"), tp, sl, str("message"), str("signature")));
      }
      return send(404, { error: "Not found" });
    } catch (e) {
      return send(400, { error: (e as Error).message });
    }
  });
  server.listen(port, () => log(`[ls] API listening on :${port}`));
  return server;
}

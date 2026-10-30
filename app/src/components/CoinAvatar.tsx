"use client";

import { useEffect, useState } from "react";
import { tint } from "@/lib/format";
import { Hover } from "./Hover";

/**
 * Coin images go through Next's image optimizer: resized to the size shown,
 * converted to WebP/AVIF and cached at the edge, so a 3 MB upload becomes a
 * ~15 KB thumbnail. Only our own /api/img proxy URLs are optimized.
 */
export const thumb = (src: string | undefined, w: 64 | 128 | 256 | 384 | 1080) =>
  src && src.startsWith("/api/img/") ? `/_next/image?url=${encodeURIComponent(src)}&w=${w}&q=75` : src;

/**
 * The coin's image (falls back to its first letter while loading or if the
 * image is missing). `zoom` shows a larger preview on hover; `expandable`
 * opens the full image on click.
 */
export function CoinAvatar({ mint, name, image, large = false, expandable = false, zoom = false }: {
  mint: string; name: string; image?: string; large?: boolean; expandable?: boolean; zoom?: boolean;
}) {
  const [state, setState] = useState<"loading" | "ok" | "broken">(image ? "loading" : "broken");
  const [open, setOpen] = useState(false);
  useEffect(() => setState(image ? "loading" : "broken"), [image]);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);

  const hasImg = image && state !== "broken";
  const face = (
    <div className={`avatar${large ? " lg" : ""}`} style={state === "ok" ? undefined : tint(mint)} aria-hidden={!expandable}>
      {state !== "ok" && <span className="avatar-letter">{(name[0] ?? "?").toUpperCase()}</span>}
      {hasImg && (
        <img src={thumb(image, large ? 256 : 128)} alt="" decoding="async" fetchPriority={large ? "high" : "auto"} onLoad={() => setState("ok")} onError={() => setState("broken")} style={state === "ok" ? undefined : { opacity: 0 }} />
      )}
    </div>
  );

  let out = face;
  if (expandable && state === "ok") {
    out = (
      <>
        <button type="button" className="avatar-btn" onClick={() => setOpen(true)} aria-label={`View ${name} image`}>{face}</button>
        {open && (
          <div className="lightbox" role="dialog" aria-label={`${name} image`} onClick={() => setOpen(false)}>
            <img src={thumb(image, 1080)} alt={name} />
          </div>
        )}
      </>
    );
  }
  if (zoom && state === "ok") {
    return (
      <Hover width={232} card={() => <img src={thumb(image, 384)} alt={name} style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block" }} />}>
        {out}
      </Hover>
    );
  }
  return out;
}

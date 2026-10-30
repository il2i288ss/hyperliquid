"use client";

import { useEffect, useState } from "react";
import { tint } from "@/lib/format";
import { Hover } from "./Hover";

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
        <img src={image} alt="" loading="lazy" decoding="async" onLoad={() => setState("ok")} onError={() => setState("broken")} style={state === "ok" ? undefined : { opacity: 0 }} />
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
            <img src={image} alt={name} />
          </div>
        )}
      </>
    );
  }
  if (zoom && state === "ok") {
    return (
      <Hover width={232} card={() => <img src={image} alt={name} style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block" }} />}>
        {out}
      </Hover>
    );
  }
  return out;
}

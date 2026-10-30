"use client";

import { useEffect, useState } from "react";
import { tint } from "@/lib/format";

/**
 * The coin's image (falls back to its first letter). `expandable` opens the
 * full image on click.
 */
export function CoinAvatar({ mint, name, image, large = false, expandable = false }: {
  mint: string; name: string; image?: string; large?: boolean; expandable?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const [open, setOpen] = useState(false);
  const show = image && !broken;

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);

  const face = (
    <div className={`avatar${large ? " lg" : ""}`} style={show ? undefined : tint(mint)} aria-hidden={!expandable}>
      {show ? <img src={image} alt="" loading="lazy" onError={() => setBroken(true)} /> : (name[0] ?? "?").toUpperCase()}
    </div>
  );
  if (!expandable || !show) return face;
  return (
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

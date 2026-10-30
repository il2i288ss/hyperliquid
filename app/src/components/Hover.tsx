"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Shows `card` in a floating box while the pointer is over `children` (or
 * over the card itself), and hides it when the pointer leaves. Rendered in a
 * portal so table rows and panels never clip it.
 */
export function Hover({ children, card, width = 320 }: { children: ReactNode; card: () => ReactNode; width?: number }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);

  const show = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      const left = Math.min(Math.max(8, r.left + r.width / 2 - width / 2), window.innerWidth - width - 8);
      const above = r.bottom + 420 > window.innerHeight && r.top > 420;
      setPos({ left, top: above ? r.top - 8 : r.bottom + 8, above });
    }, 120);
  };
  const hide = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setPos(null), 150);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [pos]);

  return (
    <>
      <span ref={anchor} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide} style={{ display: "inline-flex" }}>
        {children}
      </span>
      {pos &&
        createPortal(
          <div
            className="hovercard"
            onMouseEnter={show}
            onMouseLeave={hide}
            style={{ left: pos.left, width, ...(pos.above ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) }}
          >
            {card()}
          </div>,
          document.body,
        )}
    </>
  );
}

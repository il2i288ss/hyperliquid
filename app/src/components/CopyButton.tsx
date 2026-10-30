"use client";

import { useState } from "react";
import { short } from "@/lib/format";

/** Copies `value` (e.g. the coin's contract address). Safe inside links. */
export function CopyButton({ value, label = "CA" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  const copy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const t = document.createElement("textarea");
      t.value = value;
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      t.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  };
  return (
    <button type="button" className={`copy${done ? " done" : ""}`} onClick={copy} aria-label={`Copy ${label} ${value}`} title="Copy contract address">
      {label && <span>{label}</span>}
      <span>{short(value)}</span>
      {done ? (
        <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      )}
      <span className="sr" aria-live="polite">{done ? "Copied" : ""}</span>
    </button>
  );
}

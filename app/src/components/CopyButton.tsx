"use client";

import { useState } from "react";
import { short } from "@/lib/format";
import { Icon } from "./Icon";

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
      {done ? <Icon name="check" size={13} /> : <Icon name="copy" size={13} />}
      <span className="sr" aria-live="polite">{done ? "Copied" : ""}</span>
    </button>
  );
}

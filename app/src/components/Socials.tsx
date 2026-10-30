"use client";

import type { Coin } from "@/lib/coins";
import { Hover } from "./Hover";
import { Icon } from "./Icon";

const BRAND_ICONS = {
  x: <path fill="currentColor" stroke="none" d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.77zm-1.08 16.17h1.7L7.4 4.74H5.58z" />,
  telegram: <path d="m21.5 4.5-3.2 15.1c-.2 1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9.1-8.2c.4-.4-.1-.6-.6-.2L5.9 13.3l-4.8-1.5c-1-.3-1-1 .2-1.5l18.8-7.3c.9-.3 1.6.2 1.4 1.5z" />,
  youtube: <><rect x="2.5" y="5" width="19" height="14" rx="4" /><path d="m10 9 5 3-5 3z" /></>,
};

function Glyph({ name, size = 15 }: { name: keyof typeof BRAND_ICONS; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
      {BRAND_ICONS[name]}
    </svg>
  );
}

/** Parse an X link into a post id or a profile handle. */
function parseX(url: string) {
  try {
    const u = new URL(url);
    if (!/(^|\.)(x|twitter)\.com$/.test(u.hostname)) return null;
    const [handle, kind, id] = u.pathname.split("/").filter(Boolean);
    if (kind === "status" && /^\d+$/.test(id ?? "")) return { type: "post" as const, id, handle };
    if (handle && /^[A-Za-z0-9_]{1,15}$/.test(handle)) return { type: "profile" as const, handle };
  } catch {
    /* not a URL */
  }
  return null;
}

function XCard({ url }: { url: string }) {
  const x = parseX(url);
  if (x?.type === "post") {
    return (
      <iframe
        title="X post"
        src={`https://platform.twitter.com/embed/Tweet.html?id=${x.id}&theme=dark&dnt=true&hideThread=true`}
        style={{ width: "100%", height: 380, border: 0, display: "block", background: "var(--panel)" }}
        loading="lazy"
        sandbox="allow-scripts allow-same-origin allow-popups"
      />
    );
  }
  if (x?.type === "profile") {
    return (
      <div style={{ display: "flex", gap: 12, alignItems: "center", padding: 14 }}>
        <img src={`https://unavatar.io/x/${x.handle}`} alt="" width={52} height={52} style={{ borderRadius: 999, border: "1px solid var(--line)", background: "var(--panel-2)" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <b style={{ fontSize: 14 }}>@{x.handle}</b>
          <span className="muted" style={{ fontSize: 12 }}>Profile on X · click to open</span>
        </div>
      </div>
    );
  }
  return <div style={{ padding: 14, fontSize: 12, wordBreak: "break-all" }} className="muted">{url}</div>;
}

const open = (url: string) => (e: React.MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();
  window.open(url, "_blank", "noopener,noreferrer");
};

/** X / Telegram / YouTube / website buttons. Safe to use inside a link row. */
export function Socials({ links, size = 15 }: { links: Coin["links"]; size?: number }) {
  if (!links.twitter && !links.telegram && !links.youtube && !links.website) return null;
  return (
    <span className="socials">
      {links.twitter && (
        <Hover width={parseX(links.twitter)?.type === "post" ? 360 : 300} card={() => <XCard url={links.twitter!} />}>
          <button type="button" className="social" onClick={open(links.twitter)} aria-label="X"><Glyph name="x" size={size} /></button>
        </Hover>
      )}
      {links.telegram && <button type="button" className="social" onClick={open(links.telegram)} aria-label="Telegram"><Glyph name="telegram" size={size} /></button>}
      {links.youtube && <button type="button" className="social" onClick={open(links.youtube)} aria-label="YouTube"><Glyph name="youtube" size={size} /></button>}
      {links.website && <button type="button" className="social" onClick={open(links.website)} aria-label="Website"><Icon name="globe" size={size} /></button>}
    </span>
  );
}

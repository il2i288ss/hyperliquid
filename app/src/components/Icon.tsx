/**
 * Thin line icons (24px grid, 1.5 stroke), matching the site's icon set.
 * <Icon name="search" /> — inherits the text color.
 */
const PATHS = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></>,
  check: <path d="M20 6 9 17l-5-5" />,
  external: <><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>,
  compass: <><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></>,
  rocket: <><path d="M5 15c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9A2.2 2.2 0 0 0 5 15z" /><path d="m12 15-3-3a22 22 0 0 1 2-3.9A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22.4 22.4 0 0 1-4 2z" /><path d="M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0" /><path d="M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5" /></>,
  book: <><path d="M4 19.5V5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2z" /><path d="M8 7h8M8 11h6" /></>,
  up: <><path d="M7 17 17 7" /><path d="M7 7h10v10" /></>,
  down: <><path d="M7 7l10 10" /><path d="M17 7v10H7" /></>,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  zap: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  coins: <><circle cx="8" cy="8" r="6" /><path d="M18.1 10.4A6 6 0 1 1 10.3 18" /><path d="M7 6h1v4" /></>,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  users: <><circle cx="9" cy="8" r="4" /><path d="M2 21a7 7 0 0 1 14 0" /><path d="M16 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
  sort: <><path d="m3 8 4-4 4 4" /><path d="M7 4v16" /><path d="m21 16-4 4-4-4" /><path d="M17 20V4" /></>,
  filter: <path d="M3 4h18l-7 8.5V19l-4 2v-8.5z" />,
  x: <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></>,
  alert: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>,
  wallet: <><path d="M3 7a2 2 0 0 1 2-2h14v4" /><path d="M3 7v11a2 2 0 0 0 2 2h16V9H5a2 2 0 0 1-2-2z" /><path d="M17 14.5h.01" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  send: <><path d="m22 2-7 20-4-9-9-4z" /><path d="M22 2 11 13" /></>,
  layers: <><path d="m12 2 10 5-10 5L2 7z" /><path d="m2 17 10 5 10-5" /><path d="m2 12 10 5 10-5" /></>,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16, label }: { name: IconName; size?: number; label?: string }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {PATHS[name]}
    </svg>
  );
}

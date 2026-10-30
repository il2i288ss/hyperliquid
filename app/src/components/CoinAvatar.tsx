import { tint } from "@/lib/format";

export function CoinAvatar({ mint, name, large = false }: { mint: string; name: string; large?: boolean }) {
  return (
    <div className={`avatar${large ? " lg" : ""}`} style={tint(mint)} aria-hidden="true">
      {(name[0] ?? "?").toUpperCase()}
    </div>
  );
}

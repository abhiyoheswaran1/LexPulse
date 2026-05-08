import { cn, bandBg } from "@/lib/utils";

export function RiskBadge({
  score,
  band,
  size = "sm",
  delta,
}: {
  score: number;
  band: string;
  size?: "sm" | "md" | "lg";
  delta?: number | null;
}) {
  const sizeCls =
    size === "lg"
      ? "px-3 py-1.5 text-sm gap-2"
      : size === "md"
        ? "px-2.5 py-1 text-xs gap-1.5"
        : "px-2 py-0.5 text-xs gap-1.5";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border tabular font-medium",
        bandBg(band),
        sizeCls,
      )}
      title={
        `Risk band: ${band}` +
        (delta !== undefined && delta !== null ? ` · 7d Δ ${delta > 0 ? "+" : ""}${delta}` : "")
      }
    >
      <span className="size-1.5 rounded-full bg-current opacity-80" />
      <span className="tabular font-semibold">{score}</span>
      <span className="text-[11px] uppercase tracking-[0.16em] opacity-70">{band}</span>
      {delta !== undefined && delta !== null && delta !== 0 && (
        <span
          className={cn(
            "inline-flex items-center gap-0.5 ml-1 text-[11px] tabular font-semibold",
            delta > 0 ? "text-bad" : "text-ok",
          )}
        >
          <span aria-hidden>{delta > 0 ? "↑" : "↓"}</span>
          {Math.abs(delta)}
        </span>
      )}
    </span>
  );
}

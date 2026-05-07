import { cn, bandBg } from "@/lib/utils";

export function RiskBadge({
  score,
  band,
  size = "sm",
  delta,
}: {
  score: number;
  band: string;
  size?: "sm" | "lg";
  delta?: number | null;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border tabular font-medium",
        bandBg(band),
        size === "lg" ? "px-2.5 py-1 text-sm" : "px-2 py-0.5 text-xs",
      )}
      title={`Risk band: ${band}${delta !== undefined && delta !== null ? ` · 7d Δ ${delta > 0 ? "+" : ""}${delta}` : ""}`}
    >
      <span className="size-1.5 rounded-full bg-current opacity-80" />
      {score}
      <span className="text-[10px] uppercase tracking-wider opacity-70 ml-0.5">{band}</span>
      {delta !== undefined && delta !== null && delta !== 0 && (
        <span
          className={cn(
            "text-[10px] tabular ml-1 font-semibold",
            delta > 0 ? "text-bad" : "text-ok",
          )}
        >
          {delta > 0 ? "↑" : "↓"}
          {Math.abs(delta)}
        </span>
      )}
    </span>
  );
}

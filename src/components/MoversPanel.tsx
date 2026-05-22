import { Panel } from "./Panel";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type MoverRow = {
  id: string;
  name: string;
  ticker: string | null;
  score: number;
  band: string;
  delta7d: number;
};

export function MoversPanel({ rows }: { rows: MoverRow[] }) {
  if (rows.length === 0) {
    return (
      <Panel title="Biggest movers" subtitle="7-day score change">
        <div className="text-xs text-muted py-2">No movement in the last 7 days.</div>
      </Panel>
    );
  }
  return (
    <Panel title="Biggest movers" subtitle="7-day score change">
      <ul className="space-y-1">
        {rows.map((r) => {
          const Up = r.delta7d > 0;
          return (
            <li key={r.id}>
              <a
                href={`/companies/${r.id}`}
                className="flex items-center justify-between gap-3 px-2 py-1.5 -mx-2 rounded-md hover:bg-panel2/60 transition"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate text-fg/90 group-hover:text-fg">
                    {r.name}
                  </div>
                  {r.ticker && (
                    <div className="text-xs text-muted tabular">{r.ticker}</div>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm tabular font-semibold text-fg/80">{r.score}</span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-0.5 text-xs tabular font-semibold w-12 justify-end",
                      Up ? "text-bad" : "text-ok",
                    )}
                  >
                    {Up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                    {Up ? "+" : ""}
                    {r.delta7d}
                  </span>
                </div>
              </a>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

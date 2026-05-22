"use client";

import { useEffect, useMemo, useState } from "react";
import { BookmarkX, RefreshCcw } from "lucide-react";
import { RiskBadge } from "@/components/RiskBadge";
import { attentionLabel, attentionLevel, attentionReason, type AttentionLevel } from "@/lib/simple-ui";
import { cn, formatRelative } from "@/lib/utils";
import { useWorkflowState } from "@/components/workflow/useWorkflowState";

type WatchlistCompany = {
  id: string;
  name: string;
  ticker: string | null;
  caseCount: number;
  score: number;
  band: string;
  recentCases: number;
  delta7d: number | null;
  sectorLabel: string | null;
  sectorSource: string | null;
  sectorConfidence: number | null;
  computedAt: string | null;
};

export default function WatchlistPage() {
  const workflow = useWorkflowState();
  const ids = useMemo(() => workflow.state.watchlist.map((company) => company.id), [workflow.state.watchlist]);
  const [rows, setRows] = useState<WatchlistCompany[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!workflow.ready || ids.length === 0) {
      setRows([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetch(`/api/companies?ids=${encodeURIComponent(ids.join(","))}&limit=100`)
      .then((response) => response.json())
      .then((json) => {
        if (!cancelled) setRows(json.companies ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ids, workflow.ready]);

  return (
    <div className="space-y-8 animate-fade-in">
      <header className="border-b border-border pb-6">
        <div className="text-xs uppercase tracking-[0.18em] text-muted">Workflow</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Watchlist</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
          Companies you want to review regularly. This list syncs to the active account workspace and still works locally if the network is unavailable.
        </p>
      </header>

      {ids.length === 0 ? (
        <section className="rounded-xl border border-border bg-panel/60 p-8">
          <h2 className="text-base font-semibold">No companies saved yet</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
            Add companies from Search or a company profile. The watchlist will hydrate each saved company with the latest score and filing pressure.
          </p>
          <a
            href="/search"
            className="mt-5 inline-flex rounded-md border border-border px-3 py-2 text-sm text-muted transition hover:border-accent/60 hover:text-accent"
          >
            Find companies
          </a>
        </section>
      ) : (
        <section className="rounded-xl border border-border bg-panel/60">
          <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold">Saved companies</h2>
              <p className="mt-0.5 text-xs text-muted">
                {ids.length.toLocaleString()} saved {ids.length === 1 ? "company" : "companies"}
              </p>
            </div>
            {loading && (
              <span className="inline-flex items-center gap-2 text-xs text-muted">
                <RefreshCcw className="size-3.5 animate-spin" /> Refreshing
              </span>
            )}
          </header>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-[0.14em] text-muted">
                <tr>
                  <th className="px-5 py-3 text-left font-normal">Company</th>
                  <th className="px-4 py-3 text-left font-normal">Attention</th>
                  <th className="px-4 py-3 text-left font-normal">Confidence</th>
                  <th className="px-4 py-3 text-right font-normal">Cases</th>
                  <th className="px-4 py-3 text-right font-normal">12mo</th>
                  <th className="px-4 py-3 text-right font-normal">Risk</th>
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => {
                  const input = {
                    score: row.score,
                    band: row.band,
                    recentCases: row.recentCases,
                    delta7d: row.delta7d,
                  };
                  const level = attentionLevel(input);
                  return (
                    <tr key={row.id} className="transition hover:bg-panel2/40">
                      <td className="px-5 py-4">
                        <a href={`/companies/${row.id}`} className="font-medium hover:text-accent">
                          {row.name}
                        </a>
                        <div className="mt-1 text-xs text-muted">
                          {row.ticker ? `${row.ticker}, ` : ""}
                          {row.sectorLabel ?? "Unclassified"}
                          {row.computedAt ? `, updated ${formatRelative(new Date(row.computedAt))}` : ""}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <AttentionPill level={level} label={attentionLabel(level)} />
                        <div className="mt-2 max-w-xs text-xs leading-5 text-muted">{attentionReason(input)}</div>
                      </td>
                      <td className="px-4 py-4">
                        <ConfidencePill source={row.sectorSource} confidence={row.sectorConfidence} />
                      </td>
                      <td className="px-4 py-4 text-right tabular">{row.caseCount.toLocaleString()}</td>
                      <td className="px-4 py-4 text-right tabular">{row.recentCases.toLocaleString()}</td>
                      <td className="px-4 py-4 text-right">
                        <RiskBadge score={row.score} band={row.band} />
                      </td>
                      <td className="px-4 py-4">
                        <button
                          type="button"
                          onClick={() => workflow.removeCompany(row.id)}
                          className="grid size-8 place-items-center rounded-md text-muted transition hover:bg-panel2 hover:text-fg"
                          aria-label={`Remove ${row.name}`}
                        >
                          <BookmarkX className="size-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function AttentionPill({ level, label }: { level: AttentionLevel; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        level === "review" && "border-bad/40 bg-bad/10 text-bad",
        level === "monitor" && "border-warn/40 bg-warn/10 text-warn",
        level === "quiet" && "border-ok/30 bg-ok/10 text-ok",
      )}
    >
      <span className="size-1.5 rounded-full bg-current opacity-75" />
      {label}
    </span>
  );
}

function ConfidencePill({
  source,
  confidence,
}: {
  source: string | null;
  confidence: number | null;
}) {
  const pct = confidence == null ? null : Math.round(confidence * 100);
  return (
    <span className="inline-flex rounded-md border border-border bg-panel2/60 px-2 py-1 text-xs text-muted">
      {pct == null ? "Confidence unknown" : `${pct}% ${source ?? "sector"} match`}
    </span>
  );
}

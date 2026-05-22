"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Panel } from "@/components/Panel";
import { RiskBadge } from "@/components/RiskBadge";
import { attentionLabel, attentionLevel, attentionReason, type AttentionLevel } from "@/lib/simple-ui";
import { cn } from "@/lib/utils";
import { SavedSearches } from "@/components/workflow/SavedSearches";
import { WatchlistButton } from "@/components/workflow/WatchlistButton";

type Result = {
  id: string;
  name: string;
  caseCount: number;
  score: number;
  band: string;
  recentCases?: number | null;
  delta7d?: number | null;
};

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("q");
    if (initial) setQ(initial);
  }, []);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const json = await r.json();
        setResults(json.results ?? []);
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="space-y-8 animate-fade-in">
      <header>
        <div className="text-xs uppercase tracking-[0.18em] text-muted">Discovery</div>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mt-1.5">Search</h1>
        <p className="text-sm text-muted mt-2 max-w-xl leading-relaxed">
          Find a company. Variants like &ldquo;Acme Inc.&rdquo; and &ldquo;ACME Corporation&rdquo;
          resolve to the same record.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <div className="relative">
            <Search className="size-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search company name..."
              className="w-full bg-panel/60 border border-border rounded-xl pl-11 pr-4 py-3 text-sm placeholder:text-muted/60 focus:outline-none focus:border-accent/60 focus:bg-panel transition"
            />
          </div>

          <Panel>
            {q.trim() === "" ? (
              <div className="text-sm text-muted py-6 text-center">Start typing to search.</div>
            ) : loading ? (
              <div className="text-sm text-muted py-6 text-center">Searching...</div>
            ) : results.length === 0 ? (
              <div className="text-sm text-muted py-6 text-center">No matches.</div>
            ) : (
              <ul className="divide-y divide-border -mx-5">
                {results.map((r) => {
                  const input = {
                    score: r.score,
                    band: r.band,
                    recentCases: r.recentCases,
                    delta7d: r.delta7d,
                  };
                  const level = attentionLevel(input);
                  return (
                    <li key={r.id} className="px-5 py-4 transition hover:bg-panel2/60">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <a href={`/companies/${r.id}`} className="text-sm font-medium hover:text-accent">
                              {r.name}
                            </a>
                            <AttentionPill level={level} label={attentionLabel(level)} />
                          </div>
                          <div className="mt-1 text-xs leading-5 text-muted">{attentionReason(input)}</div>
                          <div className="mt-1 text-xs text-muted">
                            {r.caseCount.toLocaleString()} cases on record
                            {r.recentCases != null && r.recentCases > 0 ? `, ${r.recentCases} recent` : ""}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-3 md:justify-end">
                          <WatchlistButton id={r.id} name={r.name} compact />
                          <RiskBadge score={r.score} band={r.band} />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>

        <SavedSearches currentQuery={q} />
      </div>
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

"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Search, Settings2, Sparkles } from "lucide-react";
import { RiskBadge } from "@/components/RiskBadge";
import { useWorkflowState } from "@/components/workflow/useWorkflowState";

type SearchResult = {
  id: string;
  name: string;
  ticker?: string | null;
  caseCount: number;
  score: number;
  band: string;
};

export function OnboardingPanel() {
  const workflow = useWorkflowState();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        const payload = (await response.json()) as { results?: SearchResult[] };
        setResults((payload.results ?? []).slice(0, 4));
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [query]);

  if (!workflow.ready || workflow.preference.onboardingComplete) return null;

  const hasWatchlist = workflow.state.watchlist.length > 0;

  return (
    <section className="rounded-xl border border-accent/30 bg-[linear-gradient(135deg,hsl(38_28%_15%/.92),hsl(35_18%_11%/.96))] p-5 shadow-[0_24px_80px_hsl(0_0%_0%/.22)]">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_360px]">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-xs text-accent">
            <Sparkles className="size-3.5" />
            First-run setup
          </div>
          <h2 className="mt-4 text-xl font-semibold tracking-tight">Make LexPulse yours in under a minute</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Start with the companies you care about, then set the alert threshold and digest behavior. This syncs to your account workspace.
          </p>

          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
            <PreferenceSelect
              label="Alert threshold"
              value={workflow.preference.alertThreshold}
              onChange={(value) => workflow.setPreference({ alertThreshold: value as "review" | "monitor" | "all" })}
              options={[
                ["review", "Review only"],
                ["monitor", "Review + monitor"],
                ["all", "Every signal"],
              ]}
            />
            <PreferenceSelect
              label="Digest"
              value={workflow.preference.digestFrequency}
              onChange={(value) => workflow.setPreference({ digestFrequency: value as "off" | "daily" | "weekly" })}
              options={[
                ["daily", "Daily"],
                ["weekly", "Weekly"],
                ["off", "Off"],
              ]}
            />
            <PreferenceSelect
              label="Channel"
              value={workflow.preference.digestChannel}
              onChange={(value) => workflow.setPreference({ digestChannel: value as "none" | "email" | "slack" })}
              options={[
                ["none", "In app"],
                ["email", "Email"],
                ["slack", "Slack"],
              ]}
            />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => workflow.setPreference({ onboardingComplete: true })}
              className="inline-flex items-center gap-2 rounded-md border border-accent/50 bg-accent px-3 py-2 text-sm font-medium text-bg transition hover:bg-accent/90"
            >
              <CheckCircle2 className="size-4" />
              {hasWatchlist ? "Finish setup" : "Skip for now"}
            </button>
            <a
              href="/settings"
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted transition hover:border-accent/60 hover:text-accent"
            >
              <Settings2 className="size-4" />
              Account settings
            </a>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-panel/70 p-4">
          <label className="block">
            <span className="text-[10px] uppercase tracking-[0.14em] text-muted">Add companies</span>
            <span className="mt-2 flex items-center gap-2 rounded-md border border-border bg-panel2/60 px-3 py-2">
              <Search className="size-4 text-muted" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search Apple, Microsoft..."
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted/60"
              />
            </span>
          </label>
          <div className="mt-3 space-y-2">
            {loading && <div className="rounded-md border border-border px-3 py-2 text-sm text-muted">Searching...</div>}
            {!loading && results.length === 0 && (
              <div className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted">
                Search and add companies to prioritize your dashboard.
              </div>
            )}
            {results.map((company) => {
              const watched = workflow.isWatched(company.id);
              return (
                <button
                  key={company.id}
                  type="button"
                  onClick={() => workflow.toggleCompany(company)}
                  className="flex w-full items-center justify-between gap-3 rounded-md border border-border bg-panel2/40 px-3 py-2 text-left transition hover:border-accent/60"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{company.name}</span>
                    <span className="mt-0.5 block text-xs text-muted">{company.caseCount.toLocaleString()} cases</span>
                  </span>
                  {watched ? <span className="text-xs text-ok">Added</span> : <RiskBadge score={company.score} band={company.band} />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function PreferenceSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-[0.14em] text-muted">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-border bg-panel2/70 px-3 py-2 text-sm text-fg outline-none focus:border-accent/60"
      >
        {options.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}

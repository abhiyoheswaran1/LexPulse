"use client";

import { useEffect, useMemo, useState } from "react";
import { Bookmark, Clock3, Loader2, Sparkles, TrendingUp } from "lucide-react";
import { RiskBadge } from "@/components/RiskBadge";
import { EntityRow } from "@/components/ui/EntityRow";
import { MetricStrip } from "@/components/ui/MetricStrip";
import { Panel } from "@/components/Panel";
import { attentionLevel } from "@/lib/simple-ui";
import { formatRelative } from "@/lib/utils";
import { useWorkflowState } from "./useWorkflowState";

const DASHBOARD_VISIT_KEY = "lexpulse.dashboard.lastVisit.v1";

type CompanyRow = {
  id: string;
  name: string;
  ticker: string | null;
  caseCount: number;
  score: number;
  band: string;
  recentCases: number;
  delta7d: number | null;
  sectorLabel: string | null;
  computedAt: string | null;
};

export function DashboardPersonalization() {
  const workflow = useWorkflowState();
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastVisit, setLastVisit] = useState<string | null>(null);
  const watchlistIds = workflow.state.watchlist.map((company) => company.id);

  useEffect(() => {
    if (!workflow.ready) return;
    const previousVisit = window.localStorage.getItem(DASHBOARD_VISIT_KEY);
    setLastVisit(previousVisit);
    const timeout = window.setTimeout(() => {
      window.localStorage.setItem(DASHBOARD_VISIT_KEY, new Date().toISOString());
    }, 1200);
    return () => window.clearTimeout(timeout);
  }, [workflow.ready]);

  useEffect(() => {
    if (!workflow.ready || watchlistIds.length === 0) {
      setCompanies([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/companies?ids=${watchlistIds.join(",")}&limit=100`)
      .then((response) => {
        if (!response.ok) throw new Error("watchlist_fetch_failed");
        return response.json();
      })
      .then((payload: { companies?: CompanyRow[] }) => {
        if (!cancelled) setCompanies(payload.companies ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load watched companies.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [workflow.ready, watchlistIds.join(",")]);

  const groups = useMemo(() => {
    const previous = lastVisit ? new Date(lastVisit).getTime() : null;
    const reviewNow = companies.filter((company) =>
      attentionLevel({
        score: company.score,
        band: company.band,
        delta7d: company.delta7d,
        recentCases: company.recentCases,
      }) === "review",
    );
    const changed = companies.filter((company) => (company.delta7d ?? 0) !== 0);
    const newSinceLastVisit =
      previous == null
        ? []
        : companies.filter((company) => company.computedAt && new Date(company.computedAt).getTime() > previous);

    return {
      reviewNow,
      changed,
      newSinceLastVisit,
      topWatched: [...companies].sort((a, b) => b.score - a.score).slice(0, 5),
    };
  }, [companies, lastVisit]);

  if (!workflow.ready) {
    return (
      <Panel title="My portfolio" subtitle="Loading account workspace.">
        <div className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" /> Reading saved workspace.
        </div>
      </Panel>
    );
  }

  if (watchlistIds.length === 0) {
    return (
      <Panel
        title="Personalize this dashboard"
        subtitle="Watch companies to make the dashboard prioritize your portfolio first."
        right={<Sparkles className="size-4 text-accent" />}
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <p className="max-w-2xl text-sm leading-6 text-muted">
            Once companies are saved, this page will show new changes, watched review items, and portfolio-specific movement before the global market view.
          </p>
          <div className="flex flex-wrap gap-2">
            <a href="/search" className="rounded-md border border-border px-3 py-2 text-sm text-muted transition hover:border-accent/60 hover:text-accent">
              Find companies
            </a>
            <a href="/watchlist" className="rounded-md border border-border px-3 py-2 text-sm text-muted transition hover:border-accent/60 hover:text-accent">
              Open watchlist
            </a>
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      title="My portfolio"
      subtitle="Watchlist-first view of new movement, changed companies, and review work."
      right={<Bookmark className="size-4 text-muted" />}
    >
      <div className="space-y-5">
        <MetricStrip
          columns={4}
          items={[
            { label: "Watched", value: companies.length.toLocaleString(), hint: "Account workspace" },
            { label: "Review now", value: groups.reviewNow.length.toLocaleString(), hint: "Needs attention" },
            { label: "Changed", value: groups.changed.length.toLocaleString(), hint: "7-day score move" },
            {
              label: "New since visit",
              value: groups.newSinceLastVisit.length.toLocaleString(),
              hint: lastVisit ? formatRelative(new Date(lastVisit)) : "Baseline captured",
            },
          ]}
        />

        {error ? (
          <div className="rounded-lg border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">{error}</div>
        ) : loading ? (
          <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-panel2/35 px-4 py-4 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" /> Hydrating watched companies.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <PortfolioLane title="Review now" icon={<Sparkles className="size-4" />} companies={groups.reviewNow.slice(0, 3)} />
            <PortfolioLane title="Changed" icon={<TrendingUp className="size-4" />} companies={groups.changed.slice(0, 3)} />
            <PortfolioLane title="My watched companies" icon={<Clock3 className="size-4" />} companies={groups.topWatched.slice(0, 3)} />
          </div>
        )}
      </div>
    </Panel>
  );
}

function PortfolioLane({
  title,
  icon,
  companies,
}: {
  title: string;
  icon: React.ReactNode;
  companies: CompanyRow[];
}) {
  return (
    <section className="min-w-0 rounded-lg border border-border/75 bg-panel2/30">
      <header className="flex items-center gap-2 border-b border-border/70 px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
        {icon}
        {title}
      </header>
      <div className="space-y-2 p-3">
        {companies.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-3 py-5 text-sm text-muted">
            Nothing in this lane yet.
          </div>
        ) : (
          companies.map((company) => (
            <EntityRow
              key={company.id}
              href={`/companies/${company.id}`}
              title={company.name}
              subtitle={`${company.caseCount.toLocaleString()} cases, ${company.recentCases.toLocaleString()} recent`}
              meta={company.sectorLabel ?? "Unclassified"}
              right={<RiskBadge score={company.score} band={company.band} />}
              className="border-border/60 bg-panel/45"
            />
          ))
        )}
      </div>
    </section>
  );
}

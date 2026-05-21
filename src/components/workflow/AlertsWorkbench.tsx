"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, Bell, Bookmark, ExternalLink, Save, TrendingUp, X } from "lucide-react";
import { alertAttentionLevel, attentionLabel, type AttentionLevel } from "@/lib/simple-ui";
import { cn, formatRelative } from "@/lib/utils";
import { SourceLink } from "@/components/ui/SourceLink";
import { useWorkflowState } from "./useWorkflowState";

export type AlertWorkbenchRow = {
  id: string;
  title: string;
  body: string;
  type: string;
  severity: string;
  createdAt: string;
  sourceUrl: string | null;
  company: {
    id: string;
    name: string;
    sectorKey: string | null;
    sectorLabel: string | null;
  };
};

type ReadFilter = "all" | "unread" | "read";
type AlertFilters = {
  impact: "all" | AttentionLevel;
  sector: string;
  type: string;
  read: ReadFilter;
  company: string;
  watchlistOnly: boolean;
};

const ICON: Record<string, React.ReactNode> = {
  new_case: <Bell className="size-4 text-muted" />,
  case_spike: <TrendingUp className="size-4 text-warn" />,
  risk_jump: <AlertTriangle className="size-4 text-bad" />,
};

export function AlertsWorkbench({ alerts }: { alerts: AlertWorkbenchRow[] }) {
  const workflow = useWorkflowState();
  const [filters, setFilters] = useState<AlertFilters>({
    impact: "all",
    sector: "all",
    type: "all",
    read: "all",
    company: "",
    watchlistOnly: false,
  });
  const [selectedAlert, setSelectedAlert] = useState<AlertWorkbenchRow | null>(null);

  const sectors = useMemo(() => {
    const seen = new Map<string, string>();
    for (const alert of alerts) {
      const key = alert.company.sectorKey ?? "unclassified";
      seen.set(key, alert.company.sectorLabel ?? "Unclassified");
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [alerts]);

  const types = useMemo(() => [...new Set(alerts.map((alert) => alert.type))].sort(), [alerts]);

  const visible = alerts.filter((alert) => {
    const alertImpact = alertAttentionLevel(alert);
    const isRead = workflow.isAlertRead(alert.id);
    const sectorKey = alert.company.sectorKey ?? "unclassified";
    const watched = workflow.isWatched(alert.company.id);
    return (
      (filters.impact === "all" || alertImpact === filters.impact) &&
      (filters.sector === "all" || sectorKey === filters.sector) &&
      (filters.type === "all" || alert.type === filters.type) &&
      (filters.read === "all" || (filters.read === "read" ? isRead : !isRead)) &&
      (!filters.company.trim() || alert.company.name.toLowerCase().includes(filters.company.trim().toLowerCase())) &&
      (!filters.watchlistOnly || watched)
    );
  });
  const unreadVisible = visible.filter((alert) => !workflow.isAlertRead(alert.id)).length;

  const setFilter = <K extends keyof AlertFilters>(key: K, value: AlertFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const saveCurrentFilter = () => {
    const activeParts = [
      filters.watchlistOnly ? "Watchlist" : null,
      filters.impact !== "all" ? attentionLabel(filters.impact) : null,
      filters.sector !== "all" ? sectors.find(([key]) => key === filters.sector)?.[1] : null,
      filters.type !== "all" ? filters.type.replace("_", " ") : null,
      filters.read !== "all" ? filters.read : null,
      filters.company.trim() || null,
    ].filter(Boolean);
    workflow.saveAlertFilter({
      id: `alert_filter_${Date.now()}`,
      name: activeParts.length ? activeParts.join(", ") : "All alerts",
      filters,
    });
  };

  return (
    <section className="rounded-xl border border-border bg-panel/60">
      <header className="border-b border-border px-5 py-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="text-sm font-semibold">Alert workbench</h2>
            <p className="mt-0.5 text-xs text-muted">
              {visible.length.toLocaleString()} visible, {unreadVisible.toLocaleString()} unread
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveCurrentFilter}
              className="inline-flex w-fit items-center gap-2 rounded-md border border-border px-3 py-2 text-xs text-muted transition hover:border-accent/60 hover:text-accent"
            >
              <Save className="size-3.5" /> Save filter
            </button>
            <button
              type="button"
              disabled={visible.length === 0}
              onClick={() => workflow.markManyRead(visible.map((alert) => alert.id))}
              className="w-fit rounded-md border border-border px-3 py-2 text-xs text-muted transition hover:border-accent/60 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              Mark all reviewed
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
          <FilterSelect label="Impact" value={filters.impact} onChange={(value) => setFilter("impact", value as "all" | AttentionLevel)}>
            <option value="all">All impact</option>
            <option value="review">Review now</option>
            <option value="monitor">Monitor</option>
            <option value="quiet">Informational</option>
          </FilterSelect>
          <FilterSelect label="Sector" value={filters.sector} onChange={(value) => setFilter("sector", value)}>
            <option value="all">All sectors</option>
            {sectors.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Type" value={filters.type} onChange={(value) => setFilter("type", value)}>
            <option value="all">All types</option>
            {types.map((alertType) => (
              <option key={alertType} value={alertType}>
                {alertType.replace("_", " ")}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="State" value={filters.read} onChange={(value) => setFilter("read", value as ReadFilter)}>
            <option value="all">Read and unread</option>
            <option value="unread">Unread only</option>
            <option value="read">Read only</option>
          </FilterSelect>
          <label className="block">
            <span className="text-[10px] uppercase tracking-[0.14em] text-muted">Company</span>
            <input
              value={filters.company}
              onChange={(event) => setFilter("company", event.target.value)}
              placeholder="Filter company"
              className="mt-1 w-full rounded-md border border-border bg-panel2/60 px-3 py-2 text-sm placeholder:text-muted/60 focus:border-accent/60 focus:outline-none"
            />
          </label>
          <label className="flex min-h-[62px] items-end gap-2 rounded-md border border-border bg-panel2/35 px-3 py-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={filters.watchlistOnly}
              onChange={(event) => setFilter("watchlistOnly", event.target.checked)}
              className="size-4 accent-[hsl(38_88%_58%)]"
            />
            <span className="inline-flex items-center gap-1.5">
              <Bookmark className="size-3.5" /> Watchlist only
            </span>
          </label>
        </div>

        {workflow.state.savedAlertFilters.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {workflow.state.savedAlertFilters.map((saved) => (
              <span key={saved.id} className="inline-flex overflow-hidden rounded-full border border-border text-xs text-muted">
                <button
                  type="button"
                  onClick={() => setFilters(saved.filters as AlertFilters)}
                  className="px-2.5 py-1 transition hover:bg-panel2 hover:text-accent"
                >
                  {saved.name}
                </button>
                <button
                  type="button"
                  onClick={() => workflow.removeAlertFilter(saved.id)}
                  className="border-l border-border px-1.5 text-muted/70 transition hover:bg-panel2 hover:text-fg"
                  aria-label={`Remove ${saved.name}`}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </header>

      {visible.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-muted">No alerts match these filters.</div>
      ) : (
        <ul className="divide-y divide-border">
          {visible.map((alert) => {
            const level = alertAttentionLevel(alert);
            const isRead = workflow.isAlertRead(alert.id);
            return (
              <li key={alert.id} className={cn("px-5 py-4 transition hover:bg-panel2/40", isRead && "opacity-60")}>
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md border border-border bg-panel2/60">
                      {ICON[alert.type] ?? <Bell className="size-4 text-muted" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <ImpactPill level={level} label={attentionLabel(level)} />
                        {isRead && <span className="text-xs text-muted">Read</span>}
                      </div>
                      <h3 className="mt-2 text-sm font-medium text-fg/95">{alert.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-fg/80">{alert.body}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                        <Link href={`/companies/${alert.company.id}`} className="hover:text-accent">
                          {alert.company.name}
                        </Link>
                        <span>{alert.company.sectorLabel ?? "Unclassified"}</span>
                        <span>{alert.type.replace("_", " ")}</span>
                        <span>{formatRelative(new Date(alert.createdAt))}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2 xl:justify-end">
                    <button
                      type="button"
                      onClick={() => setSelectedAlert(alert)}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted transition hover:border-accent/60 hover:text-accent"
                    >
                      Source drawer <ExternalLink className="size-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => (isRead ? workflow.markUnread(alert.id) : workflow.markRead(alert.id))}
                      className="rounded-md border border-border px-2.5 py-1.5 text-xs text-muted transition hover:border-accent/60 hover:text-accent"
                    >
                      {isRead ? "Mark unread" : "Mark read"}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {selectedAlert && (
        <SourceDrawer alert={selectedAlert} onClose={() => setSelectedAlert(null)} />
      )}
    </section>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-[0.14em] text-muted">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-border bg-panel2/60 px-3 py-2 text-sm capitalize text-fg focus:border-accent/60 focus:outline-none"
      >
        {children}
      </select>
    </label>
  );
}

function ImpactPill({ level, label }: { level: AttentionLevel; label: string }) {
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

function SourceDrawer({ alert, onClose }: { alert: AlertWorkbenchRow; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-bg/60 backdrop-blur-sm" role="dialog" aria-modal="true">
      <button className="absolute inset-0 cursor-default" type="button" aria-label="Close source drawer" onClick={onClose} />
      <aside className="absolute inset-x-3 bottom-3 max-h-[86vh] overflow-y-auto rounded-xl border border-border bg-panel shadow-2xl shadow-black/30 md:inset-x-auto md:bottom-0 md:right-0 md:top-0 md:w-[440px] md:rounded-none md:border-y-0 md:border-r-0">
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted">Alert source</div>
            <h3 className="mt-2 text-lg font-semibold leading-tight">{alert.title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 shrink-0 place-items-center rounded-md border border-border text-muted transition hover:border-accent/60 hover:text-accent"
            aria-label="Close source drawer"
          >
            <X className="size-4" />
          </button>
        </header>
        <div className="space-y-5 px-5 py-4">
          <p className="text-sm leading-6 text-fg/85">{alert.body}</p>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <SourceDetail label="Company" value={alert.company.name} />
            <SourceDetail label="Sector" value={alert.company.sectorLabel ?? "Unclassified"} />
            <SourceDetail label="Type" value={alert.type.replace("_", " ")} />
            <SourceDetail label="Created" value={formatRelative(new Date(alert.createdAt))} />
          </dl>
          <div className="rounded-lg border border-border bg-panel2/35 p-4">
            <div className="text-xs font-medium text-fg/90">Primary source</div>
            <p className="mt-1 text-xs leading-5 text-muted">
              Open the linked docket when available. If no source is present, this alert came from an aggregate score or filing spike.
            </p>
            <SourceLink href={alert.sourceUrl} label="Open docket" className="mt-3" />
          </div>
          <Link
            href={`/companies/${alert.company.id}`}
            className="inline-flex rounded-md border border-border px-3 py-2 text-sm text-muted transition hover:border-accent/60 hover:text-accent"
          >
            Open company profile
          </Link>
        </div>
      </aside>
    </div>
  );
}

function SourceDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-panel2/35 p-3">
      <dt className="text-[10px] uppercase tracking-[0.14em] text-muted">{label}</dt>
      <dd className="mt-1 text-sm capitalize text-fg/90">{value}</dd>
    </div>
  );
}

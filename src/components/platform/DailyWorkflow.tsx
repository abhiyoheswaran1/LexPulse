"use client";

import { useEffect, useState } from "react";
import { Bell, CheckCircle2, ClipboardList, MessageSquarePlus, RefreshCw } from "lucide-react";
import { RiskBadge } from "@/components/RiskBadge";
import { useWorkflowState } from "@/components/workflow/useWorkflowState";
import { formatRelative } from "@/lib/utils";

type WorkflowPayload = {
  watchedCount: number;
  reviewNow: CompanyRow[];
  changedCompanies: CompanyRow[];
  watchedCompanies: CompanyRow[];
  alerts: AlertRow[];
  notes: NoteRow[];
};

type CompanyRow = {
  id: string;
  name: string;
  ticker: string | null;
  score: number;
  band: string;
  caseCount: number;
  recentCases: number;
  delta7d: number | null;
  computedAt: string | null;
};

type AlertRow = {
  id: string;
  title: string;
  body: string;
  type: string;
  severity: string;
  createdAt: string;
  read: boolean;
  company: { id: string; name: string; sectorLabel: string };
};

type NoteRow = {
  id: string;
  targetType: string;
  targetId: string;
  body: string;
  createdAt: string;
};

export function DailyWorkflow() {
  const workflow = useWorkflowState();
  const [payload, setPayload] = useState<WorkflowPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");

  const refresh = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/workflow", { cache: "no-store" });
      setPayload((await response.json()) as WorkflowPayload);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const saveNote = async () => {
    if (!note.trim()) return;
    await fetch("/api/platform/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetType: "workflow", targetId: "daily", body: note }),
    });
    setNote("");
    await refresh();
  };

  if (loading && !payload) {
    return <DailyWorkflowLoading />;
  }

  if (!payload) {
    return <div className="rounded-xl border border-bad/30 bg-bad/10 p-6 text-sm text-bad">Daily workflow could not load.</div>;
  }

  const unread = payload.alerts.filter((alert) => !workflow.isAlertRead(alert.id)).length;

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Metric label="Watched" value={payload.watchedCount.toLocaleString()} />
        <Metric label="Review now" value={payload.reviewNow.length.toLocaleString()} />
        <Metric label="Changed" value={payload.changedCompanies.length.toLocaleString()} />
        <Metric label="Unread alerts" value={unread.toLocaleString()} />
      </section>

      {payload.watchedCount === 0 && (
        <section className="rounded-xl border border-accent/30 bg-accent/10 p-5">
          <h2 className="text-sm font-semibold text-accent">Start by adding companies</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            The daily workflow becomes portfolio-first once the watchlist has companies. Search or use onboarding on the dashboard to add the first set.
          </p>
          <a
            href="/search"
            className="mt-4 inline-flex rounded-md border border-accent/50 px-3 py-2 text-sm text-accent transition hover:bg-accent/10"
          >
            Find companies
          </a>
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <WorkflowPanel title="Review now" subtitle="Watched companies with high score or material movement.">
          <CompanyList rows={payload.reviewNow} empty="No watched companies need review." />
        </WorkflowPanel>
        <WorkflowPanel title="Companies that changed" subtitle="Score movement since the previous snapshot.">
          <CompanyList rows={payload.changedCompanies} empty="No watched companies changed." />
        </WorkflowPanel>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <WorkflowPanel
          title="Portfolio alerts"
          subtitle="Unread and recently reviewed alerts for watched companies."
          action={
            <button
              type="button"
              onClick={() => workflow.markManyRead(payload.alerts.map((alert) => alert.id))}
              className="rounded-md border border-border px-3 py-2 text-xs text-muted transition hover:border-accent/60 hover:text-accent"
            >
              Mark all reviewed
            </button>
          }
        >
          <AlertList rows={payload.alerts} onToggle={(id) => (workflow.isAlertRead(id) ? workflow.markUnread(id) : workflow.markRead(id))} isRead={workflow.isAlertRead} />
        </WorkflowPanel>

        <WorkflowPanel
          title="Review notes"
          subtitle="Lightweight account notes for the daily desk workflow."
          action={
            <button
              type="button"
              onClick={() => void refresh()}
              className="grid size-8 place-items-center rounded-md border border-border text-muted transition hover:border-accent/60 hover:text-accent"
              aria-label="Refresh daily workflow"
            >
              <RefreshCw className="size-3.5" />
            </button>
          }
        >
          <div className="space-y-3">
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Add a desk note..."
              className="min-h-24 w-full resize-y rounded-md border border-border bg-panel2/60 px-3 py-2 text-sm outline-none placeholder:text-muted/60 focus:border-accent/60"
            />
            <button
              type="button"
              onClick={saveNote}
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted transition hover:border-accent/60 hover:text-accent"
            >
              <MessageSquarePlus className="size-4" />
              Save note
            </button>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {payload.notes.length === 0 ? (
                <li className="px-3 py-4 text-sm text-muted">No workflow notes yet.</li>
              ) : (
                payload.notes.map((item) => (
                  <li key={item.id} className="px-3 py-3">
                    <p className="text-sm leading-6 text-fg/85">{item.body}</p>
                    <div className="mt-1 text-xs text-muted">{formatRelative(new Date(item.createdAt))}</div>
                  </li>
                ))
              )}
            </ul>
          </div>
        </WorkflowPanel>
      </div>
    </div>
  );
}

function DailyWorkflowLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {["Watched", "Review now", "Changed", "Unread alerts"].map((label) => (
          <div key={label} className="rounded-xl border border-border bg-panel/60 p-4">
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted">{label}</div>
            <div className="mt-3 h-7 w-16 animate-pulse rounded bg-panel2" />
          </div>
        ))}
      </section>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <WorkflowPanel title="Review now" subtitle="Loading watched companies with high score or material movement.">
          <LoadingRows />
        </WorkflowPanel>
        <WorkflowPanel title="Companies that changed" subtitle="Loading score movement since the previous snapshot.">
          <LoadingRows />
        </WorkflowPanel>
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <WorkflowPanel title="Portfolio alerts" subtitle="Loading unread and recently reviewed alerts.">
          <LoadingRows />
        </WorkflowPanel>
        <WorkflowPanel title="Review notes" subtitle="Loading account notes for the daily desk workflow.">
          <LoadingRows />
        </WorkflowPanel>
      </div>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((item) => (
        <div key={item} className="rounded-lg border border-border bg-panel2/35 p-3">
          <div className="h-4 w-2/3 animate-pulse rounded bg-panel" />
          <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-panel" />
        </div>
      ))}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-panel/60 p-4">
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted">{label}</div>
      <div className="mt-2 font-mono text-2xl font-semibold tabular">{value}</div>
    </div>
  );
}

function WorkflowPanel({ title, subtitle, action, children }: { title: string; subtitle: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-panel/60">
      <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-1 text-xs text-muted">{subtitle}</p>
        </div>
        {action}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function CompanyList({ rows, empty }: { rows: CompanyRow[]; empty: string }) {
  if (rows.length === 0) return <div className="text-sm text-muted">{empty}</div>;
  return (
    <ul className="space-y-2">
      {rows.map((company) => (
        <li key={company.id}>
          <a href={`/companies/${company.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-panel2/35 p-3 transition hover:border-accent/50">
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{company.name}</span>
              <span className="mt-1 block text-xs text-muted">
                {company.caseCount.toLocaleString()} cases · {company.recentCases.toLocaleString()} trailing 12mo
              </span>
            </span>
            <RiskBadge score={company.score} band={company.band} />
          </a>
        </li>
      ))}
    </ul>
  );
}

function AlertList({ rows, onToggle, isRead }: { rows: AlertRow[]; onToggle: (id: string) => void; isRead: (id: string) => boolean }) {
  if (rows.length === 0) return <div className="text-sm text-muted">No portfolio alerts yet.</div>;
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {rows.slice(0, 12).map((alert) => {
        const read = isRead(alert.id);
        return (
          <li key={alert.id} className={`flex flex-col gap-3 px-3 py-3 md:flex-row md:items-start md:justify-between ${read ? "opacity-60" : ""}`}>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Bell className="size-3.5 text-muted" />
                <a href={`/companies/${alert.company.id}`} className="text-xs text-muted hover:text-accent">
                  {alert.company.name}
                </a>
              </div>
              <div className="mt-1 text-sm font-medium">{alert.title}</div>
              <div className="mt-1 text-xs text-muted">{formatRelative(new Date(alert.createdAt))}</div>
            </div>
            <button
              type="button"
              onClick={() => onToggle(alert.id)}
              className="inline-flex w-fit items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted transition hover:border-accent/60 hover:text-accent"
            >
              <CheckCircle2 className="size-3.5" />
              {read ? "Unread" : "Reviewed"}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

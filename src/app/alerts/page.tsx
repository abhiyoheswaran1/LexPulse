import Link from "next/link";
import { prisma } from "@/lib/db";
import { Panel } from "@/components/Panel";
import { formatRelative, cn } from "@/lib/utils";
import { AlertTriangle, Bell, TrendingUp } from "lucide-react";
import { alertAttentionLevel, attentionLabel, type AttentionLevel } from "@/lib/simple-ui";

export const dynamic = "force-dynamic";

type AlertRow = {
  id: string;
  title: string;
  body: string;
  type: string;
  severity: string;
  createdAt: Date;
  company: { id: string; name: string };
};

const ICON: Record<string, React.ReactNode> = {
  new_case: <Bell className="size-4 text-muted" />,
  case_spike: <TrendingUp className="size-4 text-warn" />,
  risk_jump: <AlertTriangle className="size-4 text-bad" />,
};

export default async function AlertsPage() {
  const alerts = await prisma.alert.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { company: { select: { id: true, name: true } } },
  });
  const groups = groupAlerts(alerts);

  return (
    <div className="space-y-8 animate-fade-in">
      <header className="border-b border-border pb-6">
        <div className="text-xs uppercase tracking-[0.18em] text-muted">Signal feed</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Alerts</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
          Material changes grouped by investor impact. Open a company profile for drivers,
          filings, benchmarks, and source links.
        </p>
      </header>

      {alerts.length === 0 ? (
        <Panel>
          <div className="py-6 text-center text-sm text-muted">No alerts yet.</div>
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <AlertGroup title="Review now" level="review" alerts={groups.review} />
          <AlertGroup title="Monitor" level="monitor" alerts={groups.monitor} />
          <AlertGroup title="Informational" level="quiet" alerts={groups.quiet} />
        </div>
      )}
    </div>
  );
}

function AlertGroup({
  title,
  level,
  alerts,
}: {
  title: string;
  level: AttentionLevel;
  alerts: AlertRow[];
}) {
  return (
    <Panel
      title={title}
      subtitle={`${alerts.length.toLocaleString()} recent ${alerts.length === 1 ? "change" : "changes"}`}
      right={<ImpactPill level={level} label={attentionLabel(level)} />}
    >
      {alerts.length === 0 ? (
        <div className="py-8 text-sm text-muted">Nothing in this group.</div>
      ) : (
        <ul className="-mx-5 -mb-5 divide-y divide-border">
          {alerts.map((alert) => (
            <li key={alert.id}>
              <Link href={`/companies/${alert.company.id}`} className="block px-5 py-4 transition hover:bg-panel2/60">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md border border-border bg-panel2/60">
                    {ICON[alert.type] ?? <Bell className="size-4 text-muted" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{alert.title}</div>
                        <div className="mt-0.5 text-xs text-muted">
                          {alert.company.name}, <span className="uppercase tracking-wider">{alert.type.replace("_", " ")}</span>
                        </div>
                      </div>
                      <div className="shrink-0 text-xs text-muted">{formatRelative(alert.createdAt)}</div>
                    </div>
                    <p className="mt-2 text-sm leading-5 text-fg/80">{alert.body}</p>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
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

function groupAlerts(alerts: AlertRow[]): Record<AttentionLevel, AlertRow[]> {
  return alerts.reduce(
    (acc, alert) => {
      acc[alertAttentionLevel(alert)].push(alert);
      return acc;
    },
    { review: [], monitor: [], quiet: [] } as Record<AttentionLevel, AlertRow[]>,
  );
}

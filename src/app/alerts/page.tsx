import Link from "next/link";
import { prisma } from "@/lib/db";
import { Panel } from "@/components/Panel";
import { formatRelative } from "@/lib/utils";
import { AlertTriangle, Bell, TrendingUp } from "lucide-react";

export const dynamic = "force-dynamic";

const ICON: Record<string, React.ReactNode> = {
  new_case: <Bell className="size-4 text-muted" />,
  case_spike: <TrendingUp className="size-4 text-warn" />,
  risk_jump: <AlertTriangle className="size-4 text-bad" />,
};

const SEV_COLOR: Record<string, string> = {
  critical: "border-l-bad",
  warn: "border-l-warn",
  info: "border-l-border",
};

export default async function AlertsPage() {
  const alerts = await prisma.alert.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { company: { select: { id: true, name: true } } },
  });

  return (
    <div className="space-y-8 animate-fade-in">
      <header>
        <div className="text-[11px] uppercase tracking-[0.18em] text-muted">Signal feed</div>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mt-1.5">Alerts</h1>
        <p className="text-sm text-muted mt-2 max-w-xl leading-relaxed">
          Material changes worth a second look — new filings, spikes, and risk-score jumps across
          the watched universe.
        </p>
      </header>

      <Panel>
        {alerts.length === 0 ? (
          <div className="text-sm text-muted py-6 text-center">No alerts yet.</div>
        ) : (
          <ul className="divide-y divide-border -mx-5">
            {alerts.map((a) => (
              <li key={a.id} className={`pl-4 border-l-2 ${SEV_COLOR[a.severity] ?? "border-l-border"}`}>
                <Link href={`/companies/${a.company.id}`} className="block px-5 py-3 hover:bg-panel2/60">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">{ICON[a.type] ?? <Bell className="size-4 text-muted" />}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium truncate">{a.title}</div>
                        <div className="text-xs text-muted shrink-0">{formatRelative(a.createdAt)}</div>
                      </div>
                      <div className="text-xs text-muted mt-0.5">
                        {a.company.name} · <span className="uppercase tracking-wider">{a.type.replace("_", " ")}</span>
                      </div>
                      <div className="text-sm text-fg/80 mt-1">{a.body}</div>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

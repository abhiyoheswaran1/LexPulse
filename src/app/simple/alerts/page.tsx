import Link from "next/link";
import { prisma } from "@/lib/db";
import { attentionLabel, type AttentionLevel } from "@/lib/simple-ui";
import {
  AttentionPill,
  SimpleActionLink,
  SimpleCard,
  SimpleCardHeader,
  SimplePageHeader,
} from "@/components/simple/SimpleUI";
import { formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SimpleAlert = {
  id: string;
  title: string;
  body: string;
  type: string;
  severity: string;
  createdAt: Date;
  company: { id: string; name: string };
};

export default async function SimpleAlertsPage() {
  const alerts = await prisma.alert.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { company: { select: { id: true, name: true } } },
  });

  const groups = groupAlerts(alerts);

  return (
    <div className="space-y-8">
      <SimplePageHeader
        eyebrow="Simple alerts"
        title="What changed?"
        description="Recent changes grouped by investor impact. Open a company brief for the short answer, or jump back to Advanced for the full feed."
        action={<SimpleActionLink href="/alerts">Advanced alerts</SimpleActionLink>}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <AlertGroup title="Review now" level="review" alerts={groups.review} />
        <AlertGroup title="Monitor" level="monitor" alerts={groups.monitor} />
        <AlertGroup title="Informational" level="quiet" alerts={groups.quiet} />
      </div>
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
  alerts: SimpleAlert[];
}) {
  return (
    <SimpleCard>
      <SimpleCardHeader
        title={title}
        subtitle={`${alerts.length.toLocaleString()} recent ${alerts.length === 1 ? "change" : "changes"}`}
        right={<AttentionPill level={level} label={attentionLabel(level)} />}
      />
      {alerts.length === 0 ? (
        <div className="px-5 py-8 text-sm text-[hsl(33_14%_43%)]">Nothing in this group.</div>
      ) : (
        <ul className="divide-y divide-[hsl(35_24%_84%)]">
          {alerts.map((alert) => (
            <li key={alert.id}>
              <Link
                href={`/simple/companies/${alert.company.id}`}
                className="block px-5 py-4 transition hover:bg-[hsl(38_48%_92%)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-[hsl(34_24%_14%)]">{alert.title}</h3>
                    <p className="mt-1 text-xs text-[hsl(33_14%_43%)]">
                      {alert.company.name} · {alert.type.replace("_", " ")}
                    </p>
                    <p className="mt-2 text-sm leading-5 text-[hsl(33_14%_36%)]">{alert.body}</p>
                  </div>
                  <div className="shrink-0 text-xs text-[hsl(33_14%_43%)]">{formatRelative(alert.createdAt)}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SimpleCard>
  );
}

function groupAlerts(alerts: SimpleAlert[]): Record<AttentionLevel, SimpleAlert[]> {
  return alerts.reduce(
    (acc, alert) => {
      const level = alertLevel(alert);
      acc[level].push(alert);
      return acc;
    },
    { review: [], monitor: [], quiet: [] } as Record<AttentionLevel, SimpleAlert[]>,
  );
}

function alertLevel(alert: SimpleAlert): AttentionLevel {
  if (alert.severity === "critical" || alert.type === "risk_jump" || alert.type === "case_spike") {
    return "review";
  }
  if (alert.severity === "warn" || alert.type === "new_case") {
    return "monitor";
  }
  return "quiet";
}

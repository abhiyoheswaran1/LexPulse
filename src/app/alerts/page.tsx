import { prisma } from "@/lib/db";
import { Panel } from "@/components/Panel";
import { AlertsWorkbench, type AlertWorkbenchRow } from "@/components/workflow/AlertsWorkbench";
import { courtListenerUrl } from "@/lib/utils";

export const dynamic = "force-dynamic";

type AlertRefs = {
  caseId?: string;
};

export default async function AlertsPage() {
  const alerts = await prisma.alert.findMany({
    where: { company: { displayStatus: "visible" } },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      company: {
        select: {
          id: true,
          name: true,
          sectorKey: true,
          sector: { select: { label: true } },
        },
      },
    },
  });

  const caseIds = alerts
    .map((alert) => extractCaseId(alert.refs))
    .filter((id): id is string => Boolean(id));
  const cases = caseIds.length
    ? await prisma.case.findMany({
        where: { id: { in: caseIds } },
        select: { id: true, sourceId: true, caseName: true },
      })
    : [];
  const casesById = new Map(cases.map((caseRef) => [caseRef.id, caseRef]));

  const rows: AlertWorkbenchRow[] = alerts.map((alert) => {
    const caseId = extractCaseId(alert.refs);
    const caseRef = caseId ? casesById.get(caseId) : null;
    return {
      id: alert.id,
      title: alert.title,
      body: alert.body,
      type: alert.type,
      severity: alert.severity,
      createdAt: alert.createdAt.toISOString(),
      sourceUrl: caseRef ? courtListenerUrl(caseRef.sourceId ?? null, caseRef.caseName) : null,
      company: {
        id: alert.company.id,
        name: alert.company.name,
        sectorKey: alert.company.sectorKey,
        sectorLabel: alert.company.sector?.label ?? null,
      },
    };
  });

  return (
    <div className="space-y-8 animate-fade-in">
      <header className="border-b border-border pb-6">
        <div className="text-xs uppercase tracking-[0.18em] text-muted">Signal feed</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Alerts</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
          Filter recent changes by impact, sector, company, type, and review state. Saved filters and reviewed state sync to your account workspace.
        </p>
      </header>

      {rows.length === 0 ? (
        <Panel>
          <div className="py-6 text-center text-sm text-muted">No alerts yet.</div>
        </Panel>
      ) : (
        <AlertsWorkbench alerts={rows} />
      )}
    </div>
  );
}

function extractCaseId(refs: unknown): string | null {
  if (!refs || typeof refs !== "object") return null;
  const candidate = refs as AlertRefs;
  return typeof candidate.caseId === "string" ? candidate.caseId : null;
}
